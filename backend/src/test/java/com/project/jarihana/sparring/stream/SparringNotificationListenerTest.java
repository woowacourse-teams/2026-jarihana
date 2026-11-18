package com.project.jarihana.sparring.stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

import com.project.jarihana.sparring.command.service.dto.SparringRevisionChanged;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.sql.DriverManager;

class SparringNotificationListenerTest {
    @Test
    @DisplayName("커밋한 배치 알림을 전달하고 연결 복구 후 누락된 변경을 재조회한다")
    void deliversCommittedBatchesAndResyncsAfterReconnect() throws Exception {
        // Given
        try (var db = new PostgreSQLContainer("postgres:17")) {
            db.start();
            try (var writer = DriverManager.getConnection(db.getJdbcUrl(), db.getUsername(), db.getPassword());
                    var statement = writer.createStatement()) {
                var meters = new SimpleMeterRegistry();
                var source = new PGSimpleDataSource();
                source.setURL(db.getJdbcUrl());
                source.setUser(db.getUsername());
                source.setPassword(db.getPassword());
                var publisher = new SparringNotificationPublisher(new JdbcTemplate(source), meters);
                var streams = mock(SparringStreams.class);
                var listener = new SparringNotificationListener(
                        streams, meters, db.getJdbcUrl(), db.getUsername(), db.getPassword());
                listener.start();
                try {
                    verify(streams, timeout(6000)).markAllChanged();

                    // When / Then: PostgreSQL discards notifications in rolled-back transactions.
                    writer.setAutoCommit(false);
                    statement.execute("SELECT pg_notify('sparring_revision', '1')");
                    writer.rollback();
                    verify(streams, after(300).never()).markChanged(1L);

                    statement.execute("SELECT pg_notify('sparring_revision', '1')");
                    writer.commit();
                    verify(streams, timeout(3000)).markChanged(1L);

                    // When / Then: the production publisher emits one notification per changed room.
                    publisher.committed(new SparringRevisionChanged(1));
                    publisher.committed(new SparringRevisionChanged(1));
                    publisher.committed(new SparringRevisionChanged(2));
                    publisher.publish();
                    verify(streams, timeout(3000).times(2)).markChanged(1L);
                    verify(streams, timeout(3000)).markChanged(2L);
                    assertThat(meters.counter("sparring.notifications.published").count()).isEqualTo(2);
                    assertThat(meters.counter("sparring.notifications.received").count()).isEqualTo(3);

                    // When / Then: malformed payloads do not stop later notifications.
                    writer.setAutoCommit(true);
                    statement.execute("SELECT pg_notify('sparring_revision', 'invalid')");
                    statement.execute("SELECT pg_notify('sparring_revision', '3')");
                    verify(streams, timeout(3000)).markChanged(3L);

                    // When / Then: reconnection registers LISTEN before asking streams to recover.
                    try (var result = statement.executeQuery("""
                            SELECT pg_terminate_backend(pid)
                            FROM pg_stat_activity
                            WHERE application_name = 'sparring-notification-listener'
                            """)) {
                        assertThat(result.next()).isTrue();
                        assertThat(result.getBoolean(1)).isTrue();
                    }
                    verify(streams, timeout(8000).times(2)).markAllChanged();
                    publisher.committed(new SparringRevisionChanged(4));
                    publisher.publish();
                    verify(streams, timeout(3000)).markChanged(4L);
                } finally {
                    listener.stop();
                    publisher.close();
                    meters.close();
                }
                try (var result = statement.executeQuery("""
                        SELECT count(*) FROM pg_stat_activity
                        WHERE application_name = 'sparring-notification-listener'
                        """)) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getInt(1)).isZero();
                }
            }
        }
    }
}
