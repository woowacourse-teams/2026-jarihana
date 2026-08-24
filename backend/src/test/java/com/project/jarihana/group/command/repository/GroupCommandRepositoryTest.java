package com.project.jarihana.group.command.repository;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeoutException;

import static java.util.concurrent.TimeUnit.MILLISECONDS;
import static java.util.concurrent.TimeUnit.SECONDS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GroupCommandRepositoryTest extends IntegrationTestSupport {

    @Autowired
    private GroupCommandRepository groupCommandRepository;

    @Autowired
    private GroupJpaRepository groupJpaRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @DisplayName("그룹을 비관적으로 조회하면 같은 그룹의 다음 비관적 조회는 트랜잭션 종료까지 대기한다.")
    @Test
    void pessimisticWriteLockSerializesGroupAccess() throws Exception {
        // Given
        Group group = groupJpaRepository.save(Group.createStudy(
                "비관적 락 그룹",
                "함께 활동해요",
                null,
                null,
                RecurringGroupSchedule.of(
                        Set.of(DayOfWeek.MONDAY),
                        LocalTime.of(19, 0),
                        LocalTime.of(21, 0)
                ),
                TestSupportConfig.FIXED_NOW
        ));
        TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch firstLockAcquired = new CountDownLatch(1);
        CountDownLatch secondLockRequested = new CountDownLatch(1);
        CountDownLatch releaseFirstLock = new CountDownLatch(1);

        try {
            Future<?> first = executor.submit(() -> transactionTemplate.executeWithoutResult(status -> {
                groupCommandRepository.findWithLockById(group.getId()).orElseThrow();
                firstLockAcquired.countDown();
                await(releaseFirstLock);
            }));
            assertThat(firstLockAcquired.await(3, SECONDS)).isTrue();

            // When
            Future<?> second = executor.submit(() -> {
                secondLockRequested.countDown();
                transactionTemplate.executeWithoutResult(status ->
                        groupCommandRepository.findWithLockById(group.getId()).orElseThrow());
            });

            // Then
            assertThat(secondLockRequested.await(3, SECONDS)).isTrue();
            assertThatThrownBy(() -> second.get(300, MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            releaseFirstLock.countDown();
            first.get(3, SECONDS);
            second.get(3, SECONDS);
        } finally {
            releaseFirstLock.countDown();
            executor.shutdownNow();
        }
    }

    private void await(CountDownLatch latch) {
        try {
            if (!latch.await(3, SECONDS)) {
                throw new IllegalStateException("비관적 락 테스트 대기 시간이 초과되었습니다.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("비관적 락 테스트가 중단되었습니다.", exception);
        }
    }
}
