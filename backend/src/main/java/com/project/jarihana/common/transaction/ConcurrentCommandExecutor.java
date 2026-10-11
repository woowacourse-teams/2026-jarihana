package com.project.jarihana.common.transaction;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import jakarta.persistence.OptimisticLockException;
import lombok.RequiredArgsConstructor;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Set;
import java.util.function.Supplier;

@Component
@RequiredArgsConstructor
public class ConcurrentCommandExecutor {
    private static final int MAX_ATTEMPTS = 3;
    private static final Set<String> MEMBERSHIP_CONSTRAINTS = Set.of(
            "uk_group_member_group_member", "uk_invitation_acceptance_invitation_member");
    private final PlatformTransactionManager transactionManager;

    public <T> T execute(Supplier<T> command) {
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                return transaction.execute(status -> command.get());
            } catch (RuntimeException failure) {
                if (!retryable(failure)) throw failure;
                if (attempt == MAX_ATTEMPTS) {
                    throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION, "다른 요청과 충돌했습니다. 다시 시도해 주세요.");
                }
            }
        }
        throw new IllegalStateException("동시성 재시도 횟수를 초과했습니다.");
    }

    private boolean retryable(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof OptimisticLockingFailureException || cause instanceof OptimisticLockException) return true;
            if (cause instanceof ConstraintViolationException violation
                    && "23505".equals(violation.getSQLState())
                    && MEMBERSHIP_CONSTRAINTS.contains(violation.getConstraintName())) return true;
        }
        return false;
    }
}
