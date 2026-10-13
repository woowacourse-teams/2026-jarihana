package com.project.jarihana.common.transaction;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.sql.SQLException;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ConcurrentCommandExecutorTest {
    private final PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);
    private final ConcurrentCommandExecutor executor = new ConcurrentCommandExecutor(transactions);

    @Test
    @DisplayName("버전 충돌 시 실패한 트랜잭션을 롤백한 뒤 새 트랜잭션에서 다시 판단한다.")
    void optimisticConflictRetriesAfterRollback() {
        // Given
        when(transactions.getTransaction(any())).thenAnswer(invocation -> new SimpleTransactionStatus());
        AtomicInteger attempts = new AtomicInteger();

        // When
        String result = executor.execute(() -> {
            if (attempts.incrementAndGet() == 1) throw new OptimisticLockingFailureException("충돌");
            verify(transactions).rollback(any());
            return "ALREADY_JOINED";
        });

        // Then
        assertThat(result).isEqualTo("ALREADY_JOINED");
        verify(transactions, times(2)).getTransaction(any());
        verify(transactions).commit(any());
    }

    @Test
    @DisplayName("소속의 유일 제약 충돌은 롤백 후 재시도하며 관련 없는 제약 실패는 재시도하지 않는다.")
    void retriesOnlyKnownUniqueConstraint() {
        // Given
        when(transactions.getTransaction(any())).thenAnswer(invocation -> new SimpleTransactionStatus());
        AtomicInteger attempts = new AtomicInteger();

        // When
        String result = executor.execute(() -> {
            if (attempts.incrementAndGet() == 1) {
                throw new ConstraintViolationException("중복 소속", new SQLException("중복", "23505"), "uk_group_member_group_member");
            }
            return "ALREADY_JOINED";
        });

        // Then
        assertThat(result).isEqualTo("ALREADY_JOINED");
        AtomicInteger unrelated = new AtomicInteger();
        assertThatThrownBy(() -> executor.execute(() -> {
            unrelated.incrementAndGet();
            throw new ConstraintViolationException("다른 제약", new SQLException("중복", "23505"), "uk_groups_name");
        })).isInstanceOf(ConstraintViolationException.class);
        assertThat(unrelated).hasValue(1);
    }

    @Test
    @DisplayName("최초 요청을 포함한 세 번의 시도가 모두 충돌하면 롤백 후 재시도 안내 오류를 반환한다.")
    void persistentConflictReturnsBusinessErrorAfterThreeRollbacks() {
        // Given
        when(transactions.getTransaction(any())).thenAnswer(invocation -> new SimpleTransactionStatus());

        // When & Then
        assertThatThrownBy(() -> executor.execute(() -> {
            throw new OptimisticLockingFailureException("계속 충돌");
        })).isInstanceOfSatisfying(BusinessException.class,
                failure -> assertThat(failure.getErrorCode()).isEqualTo(ErrorCode.CONCURRENT_MODIFICATION));
        verify(transactions, times(3)).getTransaction(any());
        verify(transactions, times(3)).rollback(any());
    }
}
