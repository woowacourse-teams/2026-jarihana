package com.project.jarihana.sparring.stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.Test;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;

class SparringBenchmarkListenerTest {
    @Test
    void deliversCommittedRevisionsAndResyncsAfterReconnect() throws Exception {
        try (var db = new PostgreSQLContainer("postgres:17")) {
            db.start();
            try (var writer = DriverManager.getConnection(db.getJdbcUrl(), db.getUsername(), db.getPassword());
                    var statement = writer.createStatement()) {
                var meters = new SimpleMeterRegistry();
                statement.execute("CREATE TABLE sparring_topic (id bigint PRIMARY KEY, revision bigint)");
                statement.execute("INSERT INTO sparring_topic VALUES (1, 1)");
                statement.execute(Files.readString(Path.of("benchmark/sparring/notify.sql")));

                var streams = mock(SparringStreams.class);
                var listener = new SparringBenchmarkListener(
                        streams, meters, db.getJdbcUrl(), db.getUsername(), db.getPassword(), "");
                listener.start();
                try {
                    verify(streams, timeout(6000)).markAllChanged();

                    writer.setAutoCommit(false);
                    statement.execute("UPDATE sparring_topic SET revision = 2 WHERE id = 1");
                    writer.rollback();
                    verify(streams, after(300).never()).markChanged(1L);

                    statement.execute("UPDATE sparring_topic SET revision = 2 WHERE id = 1");
                    statement.execute("UPDATE sparring_topic SET revision = 3 WHERE id = 1");
                    writer.commit();
                    verify(streams, timeout(3000).times(2)).markChanged(1L);
                    assertEquals(2, meters.counter("sparring.benchmark.notifications.received").count());

                    writer.setAutoCommit(true);
                    try (var result = statement.executeQuery("""
                            SELECT pg_terminate_backend(pid)
                            FROM pg_stat_activity
                            WHERE application_name = 'sparring-benchmark-listener'
                            """)) {
                        assertTrue(result.next());
                        assertTrue(result.getBoolean(1));
                    }
                    verify(streams, timeout(8000).times(2)).markAllChanged();
                } finally {
                    listener.stop();
                    meters.close();
                }
            }
        }
    }
}
