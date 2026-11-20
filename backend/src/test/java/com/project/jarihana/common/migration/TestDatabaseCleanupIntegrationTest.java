package com.project.jarihana.common.migration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.fail;

import com.project.jarihana.support.IntegrationTestSupport;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

class TestDatabaseCleanupIntegrationTest extends IntegrationTestSupport {

    @Autowired
    private DataSource dataSource;

    @DisplayName("DB 초기화는 SSE의 부모 테이블 조회가 끝나기를 기다리며 후속 조회를 막지 않는다.")
    @ParameterizedTest
    @CsvSource({"sparring_topic,sparring_post", "sparring_topic,sparring_vote",
            "sparring_topic,image_reference", "gomoku_room,member"})
    void cleanupWaitsForStreamQueryWithoutDeadlock(String parentTable, String childTable) throws Exception {
        // Given: stream queries lock the topic/room before related tables.
        try (var executor = Executors.newSingleThreadExecutor();
                Connection reader = dataSource.getConnection();
                Connection cleanup = dataSource.getConnection();
                Connection observer = dataSource.getConnection()) {
            reader.setAutoCommit(false);
            int readerPid = backendPid(reader);
            int cleanupPid = backendPid(cleanup);
            try (var statement = reader.createStatement()) {
                statement.executeQuery("select 1 from " + parentTable).close();
            }
            var cleaning = executor.submit(() -> {
                new ResourceDatabasePopulator(new ClassPathResource("sql/truncate.sql")).populate(cleanup);
                return null;
            });
            try {
                // When: the real cleanup SQL waits for the still-running parent read.
                awaitBlockedBy(observer, cleanupPid, readerPid);
                assertThat(cleaning.isDone()).isFalse();

                // Then: the stream query can finish its child read and let cleanup finish.
                try (var statement = reader.createStatement()) {
                    statement.setQueryTimeout(5);
                    statement.executeQuery("select 1 from " + childTable).close();
                }
                reader.commit();
                cleaning.get(5, TimeUnit.SECONDS);
            } finally {
                reader.rollback();
            }
        }
    }

    private int backendPid(Connection connection) throws SQLException {
        try (var statement = connection.createStatement();
                var result = statement.executeQuery("select pg_backend_pid()")) {
            result.next();
            return result.getInt(1);
        }
    }

    private void awaitBlockedBy(Connection observer, int waitingPid, int blockingPid) throws Exception {
        long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        try (var statement = observer.prepareStatement("select ? = any(pg_blocking_pids(?))")) {
            statement.setInt(1, blockingPid);
            statement.setInt(2, waitingPid);
            do {
                try (var result = statement.executeQuery()) {
                    result.next();
                    if (result.getBoolean(1)) {
                        return;
                    }
                }
                Thread.sleep(10);
            } while (System.nanoTime() < deadline);
        }
        fail("DB 초기화가 진행 중인 SSE 조회의 잠금 해제를 기다리지 않았습니다.");
    }
}
