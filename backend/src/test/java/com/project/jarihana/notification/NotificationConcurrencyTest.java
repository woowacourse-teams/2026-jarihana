package com.project.jarihana.notification;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.command.service.NotificationCommandService;
import com.project.jarihana.notification.command.service.dto.NotificationReadAllResult;
import com.project.jarihana.notification.domain.Notification;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationConcurrencyTest extends NotificationIntegrationTestSupport {

    @Autowired private NotificationCommandService service;
    @Autowired private PlatformTransactionManager transactions;

    @Test
    @DisplayName("전체 읽음 시작 후 새로 커밋된 알림은 더 작은 ID여도 안 읽음으로 남는다.")
    void readAllKeepsLaterCommitsUnreadRegardlessOfIdOrder() throws Exception {
        // Given
        Member owner = member("101");
        CountDownLatch inserted = new CountDownLatch(1);
        CountDownLatch commitLate = new CountDownLatch(1);
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch unlock = new CountDownLatch(1);
        AtomicLong lateId = new AtomicLong();
        AtomicInteger updatePid = new AtomicInteger();
        try (var executor = Executors.newFixedThreadPool(3)) {
            var late = executor.submit(() -> transaction().executeWithoutResult(status -> {
                lateId.set(notification(owner, "late-low-id").getId());
                inserted.countDown();
                await(commitLate);
            }));
            await(inserted);
            Notification visible = notification(owner, "visible");
            var lock = executor.submit(() -> transaction().executeWithoutResult(status -> {
                jdbc.queryForObject("select id from notifications where id = ? for update", Long.class, visible.getId());
                locked.countDown();
                await(unlock);
            }));
            await(locked);
            try {
                // When
                var reading = executor.submit(() -> transaction().execute(status -> {
                    updatePid.set(jdbc.queryForObject("select pg_backend_pid()", Integer.class));
                    return service.readAllNotifications(owner.getId());
                }));
                awaitBlocked(updatePid);
                commitLate.countDown();
                late.get(10, TimeUnit.SECONDS);
                Notification newArrival = notification(owner, "new-high-id");
                unlock.countDown();
                lock.get(10, TimeUnit.SECONDS);
                NotificationReadAllResult result = reading.get(10, TimeUnit.SECONDS);

                // Then
                assertThat(result.updatedCount()).isEqualTo(1);
                assertThat(lateId.get()).isLessThan(visible.getId());
                assertThat(notifications.findByIdAndMemberId(lateId.get(), owner.getId()).orElseThrow().getReadAt()).isNull();
                assertThat(notifications.findByIdAndMemberId(newArrival.getId(), owner.getId()).orElseThrow().getReadAt()).isNull();
                assertThat(notifications.findByIdAndMemberId(visible.getId(), owner.getId()).orElseThrow().getReadAt()).isEqualTo(NOW);
            } finally {
                commitLate.countDown();
                unlock.countDown();
            }
        }
    }

    @ParameterizedTest
    @CsvSource({"true,false", "false,false", "true,true", "false,true"})
    @DisplayName("개별·전체 읽음과 삭제가 경합해도 삭제 상태와 최초 읽음 시각을 덮어쓰지 않는다.")
    void deletionWinsAgainstConcurrentRead(boolean deleteFirst, boolean readAll) throws Exception {
        // Given
        Member owner = member("101");
        Notification notification = notification(owner, "one");
        CountDownLatch firstUpdated = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger secondPid = new AtomicInteger();
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> transaction().executeWithoutResult(status -> {
                if (deleteFirst) {
                    service.deleteNotification(owner.getId(), notification.getId());
                } else {
                    read(owner.getId(), notification.getId(), readAll);
                }
                firstUpdated.countDown();
                await(release);
            }));
            await(firstUpdated);
            try {
                // When
                var second = executor.submit(() -> {
                    try {
                        transaction().executeWithoutResult(status -> {
                            secondPid.set(jdbc.queryForObject("select pg_backend_pid()", Integer.class));
                            if (deleteFirst) {
                                read(owner.getId(), notification.getId(), readAll);
                            } else {
                                service.deleteNotification(owner.getId(), notification.getId());
                            }
                        });
                        return null;
                    } catch (BusinessException exception) {
                        return exception.getErrorCode();
                    }
                });
                awaitBlocked(secondPid);
                release.countDown();
                first.get(10, TimeUnit.SECONDS);
                ErrorCode error = second.get(10, TimeUnit.SECONDS);

                // Then
                assertThat(error).isEqualTo(deleteFirst && !readAll ? ErrorCode.NOTIFICATION_NOT_FOUND : null);
                Notification stored = notifications.findByIdAndMemberId(notification.getId(), owner.getId()).orElseThrow();
                assertThat(stored.getDeletedAt()).isEqualTo(NOW);
                assertThat(stored.getReadAt()).isEqualTo(deleteFirst ? null : NOW);
            } finally {
                release.countDown();
            }
        }
    }

    private void read(long memberId, long id, boolean all) {
        if (all) {
            service.readAllNotifications(memberId);
            return;
        }
        service.readNotification(memberId, id);
    }

    private TransactionTemplate transaction() {
        return new TransactionTemplate(transactions);
    }

    private void awaitBlocked(AtomicInteger pid) throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos();
        while (System.nanoTime() < deadline) {
            if (pid.get() != 0 && Boolean.TRUE.equals(jdbc.queryForObject(
                    "select cardinality(pg_blocking_pids(?)) > 0", Boolean.class, pid.get()))) {
                return;
            }
            Thread.sleep(10);
        }
        throw new AssertionError("PostgreSQL UPDATE가 행 잠금을 기다리지 않았습니다.");
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) {
                throw new AssertionError("트랜잭션 실행 신호가 도착하지 않았습니다.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }
}
