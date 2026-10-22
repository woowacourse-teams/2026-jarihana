package com.project.jarihana.notificationdelivery.command.service;

import com.project.jarihana.notificationdelivery.client.PushTransport;
import com.project.jarihana.notificationdelivery.client.dto.PushRequest;
import com.project.jarihana.notificationdelivery.client.dto.PushResult;
import com.project.jarihana.notificationdelivery.command.repository.dto.DeliveryClaim;
import com.project.jarihana.notificationdelivery.config.PushDeliveryProperties;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import com.project.jarihana.pushsubscription.config.PushProperties;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PushDeliveryPipelineTest {
    private final PushDeliveryLeaseService leases = mock(PushDeliveryLeaseService.class);
    private final PushTransport transport = mock(PushTransport.class);
    private final SimpleMeterRegistry metrics = new SimpleMeterRegistry();
    private final Map<Long, CompletableFuture<PushResult>> responses = new ConcurrentHashMap<>();
    private final List<Integer> limits = new CopyOnWriteArrayList<>();
    private PushDeliveryWorker worker;

    @AfterEach
    void drainWorker() {
        responses.values().forEach(response -> response.complete(PushResult.accepted()));
        if (worker != null) worker.close();
        metrics.close();
    }

    @Test
    @DisplayName("네 요청을 기다리지 않고 시작하고 먼저 끝난 한 자리만 즉시 채운다.")
    void startFourAndRefillWithoutWaitingForSlowRequest() {
        // Given
        worker = workerWithDeliveries(5, Duration.ofSeconds(2));
        // When
        assertThat(worker.processDue()).isEqualTo(4);
        // Then
        assertThat(responses).hasSize(4);
        assertThat(worker.processDue()).isZero();
        verify(leases, never()).finish(any(), any(), any());
        // When
        responses.get(2L).complete(PushResult.accepted());
        // Then
        await().atMost(Duration.ofSeconds(3)).untilAsserted(() -> {
            assertThat(responses).hasSize(5);
            verify(leases).finish(any(), any(), any());
        });
        assertThat(responses.get(1L)).isNotCompleted();
        assertThat(limits).startsWith(4, 1);
        assertThat(metrics.get("jarihana.push.inflight").gauge().value()).isEqualTo(4);
    }

    @Test
    @DisplayName("DB 결과 반영 중에는 슬롯을 유지하고 HTTP 완료 스레드에서 JDBC를 실행하지 않는다.")
    void holdCapacityUntilPersistenceCompletesOffIoThread() throws Exception {
        // Given
        worker = workerWithDeliveries(5, Duration.ofSeconds(2));
        var finishing = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var finishingThread = new AtomicReference<String>();
        doAnswer(invocation -> {
            finishingThread.set(Thread.currentThread().getName());
            finishing.countDown();
            assertThat(release.await(3, TimeUnit.SECONDS)).isTrue();
            return null;
        }).when(leases).finish(any(), any(), any());
        worker.processDue();
        try {
            // When
            responses.get(1L).complete(PushResult.accepted());
            assertThat(finishing.await(3, TimeUnit.SECONDS)).isTrue();
            // Then
            assertThat(finishingThread.get()).startsWith("push-completion-");
            assertThat(worker.processDue()).isZero();
            assertThat(responses).hasSize(4);
        } finally {
            release.countDown();
        }
        await().atMost(Duration.ofSeconds(3)).untilAsserted(() -> assertThat(responses).hasSize(5));
    }

    @Test
    @DisplayName("결과 저장이 실패해도 다른 요청을 계속 처리하고 실패한 lease는 복구 대상으로 남긴다.")
    void persistenceFailureDoesNotStrandCapacity() {
        // Given
        worker = workerWithDeliveries(5, Duration.ofSeconds(2));
        var failures = new AtomicInteger();
        doAnswer(invocation -> {
            if (failures.getAndIncrement() == 0) throw new IllegalStateException("database unavailable");
            return null;
        }).when(leases).finish(any(), any(), any());
        worker.processDue();
        // When
        responses.get(1L).complete(PushResult.accepted());
        // Then
        await().atMost(Duration.ofSeconds(3)).untilAsserted(() -> assertThat(responses).hasSize(5));
        assertThat(responses.get(2L)).isNotCompleted();
    }

    @Test
    @DisplayName("비동기 요청 자체의 예외도 재시도 결과로 저장하고 슬롯을 다시 채운다.")
    void exceptionalFutureIsRetriedAndReleasesCapacity() {
        // Given
        worker = workerWithDeliveries(5, Duration.ofSeconds(2));
        worker.processDue();
        // When
        responses.get(1L).completeExceptionally(new IllegalStateException("unavailable"));
        // Then
        await().atMost(Duration.ofSeconds(3)).untilAsserted(() -> assertThat(responses).hasSize(5));
        var result = ArgumentCaptor.forClass(PushResult.class);
        verify(leases).finish(any(), any(), result.capture());
        assertThat(result.getValue().outcome()).isEqualTo(PushResult.Outcome.RETRY);
        assertThat(result.getValue().errorCode()).isEqualTo("TRANSPORT_ERROR");
    }

    @Test
    @DisplayName("정상 종료는 새 선점을 멈추고 진행 중인 결과 저장을 기다린다.")
    void gracefulShutdownDrainsWithoutRefilling() throws Exception {
        // Given
        worker = workerWithDeliveries(5, Duration.ofSeconds(2));
        worker.processDue();
        var closing = CompletableFuture.runAsync(worker::close);
        await().atMost(Duration.ofSeconds(2)).until(() -> worker.isStopping());
        // When
        responses.values().forEach(response -> response.complete(PushResult.accepted()));
        closing.get(3, TimeUnit.SECONDS);
        // Then
        assertThat(responses).hasSize(4);
        assertThat(worker.processDue()).isZero();
        assertThat(metrics.get("jarihana.push.inflight").gauge().value()).isZero();
    }

    @Test
    @DisplayName("종료 제한시간을 넘긴 요청은 완료로 기록하지 않고 lease 복구에 맡긴다.")
    void shutdownTimeoutLeavesUnfinishedLeaseRecoverable() {
        // Given
        worker = workerWithDeliveries(4, Duration.ofMillis(50));
        worker.processDue();
        long started = System.nanoTime();
        // When
        worker.close();
        // Then
        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(1));
        verify(leases, never()).finish(any(), any(), any());
        responses.values().forEach(response -> response.complete(PushResult.accepted()));
        verify(leases, never()).finish(any(), any(), any());
        assertThat(worker.processDue()).isZero();
    }

    private PushDeliveryWorker workerWithDeliveries(int count, Duration shutdownTimeout) {
        var nextId = new AtomicLong(1);
        when(leases.claimNext(anyInt())).thenAnswer(invocation -> {
            int limit = invocation.getArgument(0);
            limits.add(limit);
            List<DeliveryClaim> claims = new ArrayList<>();
            while (claims.size() < limit && nextId.get() <= count) {
                claims.add(new DeliveryClaim(nextId.getAndIncrement(), UUID.randomUUID(), DeliveryStatus.IN_FLIGHT, 1));
            }
            return claims;
        });
        when(leases.prepare(anyList())).thenAnswer(invocation -> {
            List<DeliveryClaim> claims = invocation.getArgument(0);
            return claims.stream().map(claim -> new PushRequest(claim.id(), claim.id(), claim.id(), 1,
                    1, "https://fcm.googleapis.com/fixture", "key", "auth", LocalDateTime.of(2026, 10, 21, 1, 0))).toList();
        });
        when(transport.send(any())).thenAnswer(invocation -> {
            PushRequest request = invocation.getArgument(0);
            var response = new CompletableFuture<PushResult>();
            responses.put(request.deliveryId(), response);
            return response;
        });
        var push = mock(PushProperties.class);
        when(push.enabled()).thenReturn(true);
        when(push.batchSize()).thenReturn(50);
        var delivery = new PushDeliveryProperties(null, null, null, null, null, null, null, null, null, shutdownTimeout);
        return new PushDeliveryWorker(leases, transport, push, delivery, metrics);
    }
}
