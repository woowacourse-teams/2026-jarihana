package com.project.jarihana.notificationdelivery.command.service;

import com.project.jarihana.notificationdelivery.client.PushTransport;
import com.project.jarihana.notificationdelivery.client.dto.PushRequest;
import com.project.jarihana.notificationdelivery.client.dto.PushResult;
import com.project.jarihana.notificationdelivery.client.dto.PushResult.Outcome;
import com.project.jarihana.notificationdelivery.command.repository.dto.DeliveryClaim;
import com.project.jarihana.notificationdelivery.config.PushDeliveryProperties;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import com.project.jarihana.pushsubscription.config.PushProperties;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Slf4j
public class PushDeliveryWorker {
    private final PushDeliveryLeaseService leases;
    private final PushTransport transport;
    private final PushProperties properties;
    private final PushDeliveryProperties delivery;
    private final WorkerAdmissionController admission;
    private final MeterRegistry metrics;
    private final Semaphore slots;
    private final ThreadPoolExecutor completions;
    private final ReentrantLock dispatch = new ReentrantLock();
    private final AtomicBoolean stopping = new AtomicBoolean();
    private final Object idle = new Object();

    public PushDeliveryWorker(PushDeliveryLeaseService leases, PushTransport transport, PushProperties properties,
                              PushDeliveryProperties delivery, WorkerAdmissionController admission, MeterRegistry metrics) {
        this.leases = leases;
        this.transport = transport;
        this.properties = properties;
        this.delivery = delivery;
        this.admission = admission;
        this.metrics = metrics;
        slots = new Semaphore(delivery.maxInFlight());
        int threads = Math.min(2, delivery.maxInFlight());
        completions = new ThreadPoolExecutor(threads, threads, 0, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(delivery.maxInFlight()),
                Thread.ofPlatform().daemon(true).name("push-completion-", 0).factory(),
                new ThreadPoolExecutor.AbortPolicy());
        metrics.gauge("jarihana.push.inflight", slots, capacity -> delivery.maxInFlight() - capacity.availablePermits());
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public int processDue() {
        if (!properties.enabled() || stopping.get() || admission.state() != WorkerAdmissionController.State.ACTIVE) return 0;
        dispatch.lock();
        try {
            int count = 0;
            while (!stopping.get() && count < properties.batchSize()) {
                int limit = Math.min(slots.availablePermits(), properties.batchSize() - count);
                if (limit == 0 || !slots.tryAcquire(limit)) break;
                var permits = new ArrayList<WorkerAdmissionController.Permit>();
                for (int index = 0; index < limit; index++) {
                    var permit = admission.tryAcquire();
                    if (permit.isEmpty()) break;
                    permits.add(permit.get());
                }
                release(limit - permits.size());
                if (permits.isEmpty()) break;
                List<DeliveryClaim> claims;
                try {
                    claims = leases.claimNext(permits.size());
                    if (claims.size() > permits.size()) {
                        throw new IllegalStateException("승인한 개수보다 많은 작업을 선점했습니다.");
                    }
                } catch (RuntimeException exception) {
                    permits.forEach(permit -> finishPermit(permit, false));
                    throw exception;
                }
                for (int index = claims.size(); index < permits.size(); index++) {
                    finishPermit(permits.get(index), true);
                }
                if (claims.isEmpty()) break;
                count += claims.size();
                var active = new ArrayList<AdmittedClaim>();
                for (int index = 0; index < claims.size(); index++) {
                    var claim = claims.get(index);
                    var permit = permits.get(index);
                    if (claim.status() == DeliveryStatus.IN_FLIGHT) active.add(new AdmittedClaim(claim, permit));
                    else finishPermit(permit, true);
                }
                if (active.isEmpty()) continue;
                Map<Long, PushRequest> requests;
                try {
                    requests = leases.prepare(active.stream().map(AdmittedClaim::claim).toList()).stream()
                            .collect(Collectors.toMap(PushRequest::deliveryId, Function.identity()));
                } catch (RuntimeException exception) {
                    active.forEach(claim -> finishPermit(claim.permit(), false));
                    throw exception;
                }
                for (var claim : active) {
                    var request = requests.get(claim.claim().id());
                    if (request == null) finishPermit(claim.permit(), true);
                    else if (stopping.get()) finishPermit(claim.permit(), false);
                    else send(claim, request);
                }
            }
            return count;
        } finally {
            dispatch.unlock();
        }
    }

    private record AdmittedClaim(DeliveryClaim claim, WorkerAdmissionController.Permit permit) { }

    private void send(AdmittedClaim admitted, PushRequest request) {
        var started = Timer.start(metrics);
        CompletableFuture<PushResult> response;
        try {
            response = Objects.requireNonNull(transport.send(request));
        } catch (RuntimeException exception) {
            response = CompletableFuture.failedFuture(exception);
        }
        response.whenComplete((result, failure) -> {
            var outcome = failure == null && result != null ? result : new PushResult(Outcome.RETRY, "TRANSPORT_ERROR", null);
            started.stop(metrics.timer("jarihana.push.request.duration", "outcome", outcome.outcome().name()));
            try {
                completions.execute(() -> finish(admitted, request, outcome));
            } catch (RejectedExecutionException exception) {
                // Shutdown deadline elapsed; the unacknowledged lease remains recoverable.
                finishPermit(admitted.permit(), false);
            }
        });
    }

    private void finish(AdmittedClaim admitted, PushRequest request, PushResult result) {
        boolean confirmed = false;
        try {
            metrics.counter("jarihana.push.requests", "outcome", result.outcome().name()).increment();
            if (result.outcome() != Outcome.ACCEPTED) {
                log.atWarn().addKeyValue("event.action", "push.request.failed")
                        .addKeyValue("jarihana.delivery_id", request.deliveryId())
                        .addKeyValue("jarihana.error_code", result.errorCode()).log("Push request failed");
            }
            confirmed = leases.finish(admitted.claim(), request, result);
            if (!confirmed) throw new IllegalStateException("선점한 알림의 처리 결과를 저장하지 못했습니다.");
        } catch (RuntimeException exception) {
            logWorkerFailure(exception);
        } finally {
            finishPermit(admitted.permit(), confirmed);
        }
        try {
            processDue();
        } catch (RuntimeException exception) {
            logWorkerFailure(exception);
        }
    }

    private void finishPermit(WorkerAdmissionController.Permit permit, boolean confirmed) {
        if (confirmed) permit.complete();
        permit.close();
        release(1);
    }

    private void release(int count) {
        if (count == 0) return;
        synchronized (idle) {
            slots.release(count);
            idle.notifyAll();
        }
    }

    private void logWorkerFailure(RuntimeException exception) {
        log.atWarn().addKeyValue("event.action", "push.worker.failed")
                .addKeyValue("error.type", exception.getClass().getSimpleName()).log("Push worker failed");
    }

    boolean isStopping() {
        return stopping.get();
    }

    public boolean isIdle() {
        return slots.availablePermits() == delivery.maxInFlight() && !dispatch.isLocked()
                && completions.getActiveCount() == 0 && completions.getQueue().isEmpty();
    }

    @PreDestroy
    public void close() {
        if (!stopping.compareAndSet(false, true)) return;
        long deadline = System.nanoTime() + delivery.shutdownTimeout().toNanos();
        try {
            synchronized (idle) {
                long remaining;
                while (slots.availablePermits() < delivery.maxInFlight() && (remaining = deadline - System.nanoTime()) > 0) {
                    TimeUnit.NANOSECONDS.timedWait(idle, remaining);
                }
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        } finally {
            completions.shutdownNow();
        }
    }
}
