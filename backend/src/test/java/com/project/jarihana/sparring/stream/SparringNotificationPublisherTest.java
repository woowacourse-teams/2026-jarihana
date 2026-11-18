package com.project.jarihana.sparring.stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.project.jarihana.sparring.command.service.dto.SparringRevisionChanged;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementSetter;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.event.TransactionalEventListenerFactory;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.PreparedStatement;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

class SparringNotificationPublisherTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final SparringNotificationPublisher publisher = new SparringNotificationPublisher(jdbc, meters);
    private final List<Set<String>> publishedRooms = new ArrayList<>();

    @AfterEach
    void close() {
        publisher.close();
        meters.close();
    }

    @Test
    @DisplayName("한 배치에서 같은 토론방의 변경을 하나의 알림으로 합친다")
    void coalescesRepeatedChangesInEachBatch() throws Exception {
        // Given
        captureBatches();
        publisher.committed(new SparringRevisionChanged(1));
        publisher.committed(new SparringRevisionChanged(1));
        publisher.committed(new SparringRevisionChanged(2));

        // When
        publisher.publish();
        publisher.publish();
        publisher.committed(new SparringRevisionChanged(1));
        publisher.publish();

        // Then
        assertThat(publishedRooms).containsExactly(Set.of("1", "2"), Set.of("1"));
        assertThat(meters.counter("sparring.notifications.published").count()).isEqualTo(3);
        assertThat(meters.counter("sparring.notifications.batches").count()).isEqualTo(2);
    }

    @Test
    @DisplayName("알림 발행 중 도착한 변경은 다음 배치에 남긴다")
    void retainsChangesArrivingDuringPublication() throws Exception {
        // Given
        captureBatches(() -> publisher.committed(new SparringRevisionChanged(1)));
        publisher.committed(new SparringRevisionChanged(1));

        // When
        publisher.publish();
        captureBatches();
        publisher.publish();

        // Then
        assertThat(publishedRooms).containsExactly(Set.of("1"), Set.of("1"));
    }

    @Test
    @DisplayName("실패한 배치는 새로 도착한 변경과 함께 다시 발행한다")
    void retriesFailedBatchWithNewChanges() throws Exception {
        // Given
        when(jdbc.query(anyString(), any(PreparedStatementSetter.class), ArgumentMatchers.<ResultSetExtractor<Object>>any()))
                .thenThrow(new DataAccessResourceFailureException("unavailable"));
        publisher.committed(new SparringRevisionChanged(1));

        // When
        publisher.publish();
        publisher.committed(new SparringRevisionChanged(2));
        captureBatches();
        publisher.publish();

        // Then
        assertThat(publishedRooms).containsExactly(Set.of("1", "2"));
        assertThat(meters.counter("sparring.notifications.published").count()).isEqualTo(2);
        assertThat(meters.counter("sparring.notifications.batches").count()).isEqualTo(1);
    }

    @Test
    @DisplayName("트랜잭션 커밋 이후의 변경만 발행하고 롤백은 무시한다")
    void publishesOnlyCommittedTransactionEvents() throws Exception {
        // Given
        captureBatches();
        try (var context = new AnnotationConfigApplicationContext()) {
            context.registerBean(TransactionalEventListenerFactory.class);
            context.registerBean(SparringNotificationPublisher.class, () -> publisher);
            context.refresh();
            publisher.close(); // Use explicit batches to avoid scheduler timing in this test.
            var transaction = new TransactionTemplate(new LocalTransactionManager());

            // When
            transaction.executeWithoutResult(status -> {
                context.publishEvent(new SparringRevisionChanged(1));
                publisher.publish();
                verifyNoInteractions(jdbc);
            });
            transaction.executeWithoutResult(status -> {
                context.publishEvent(new SparringRevisionChanged(2));
                status.setRollbackOnly();
            });
            context.publishEvent(new SparringRevisionChanged(3));
            publisher.publish();

            // Then
            assertThat(publishedRooms).containsExactly(Set.of("1"));
        }
    }

    private void captureBatches() throws Exception {
        captureBatches(() -> {});
    }

    private void captureBatches(Runnable whilePublishing) throws Exception {
        doAnswer(invocation -> {
            PreparedStatement statement = mock(PreparedStatement.class);
            doAnswer(binding -> {
                publishedRooms.add(Set.of(((String) binding.getArgument(1)).split(",")));
                return null;
            }).when(statement).setString(anyInt(), anyString());
            invocation.<PreparedStatementSetter>getArgument(1).setValues(statement);
            whilePublishing.run();
            return null;
        }).when(jdbc).query(anyString(), any(PreparedStatementSetter.class), ArgumentMatchers.<ResultSetExtractor<Object>>any());
    }

    private static final class LocalTransactionManager extends AbstractPlatformTransactionManager {
        @Override
        protected Object doGetTransaction() { return new Object(); }
        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {}
        @Override
        protected void doCommit(DefaultTransactionStatus status) {}
        @Override
        protected void doRollback(DefaultTransactionStatus status) {}
    }
}
