package com.project.jarihana.notificationdelivery.command.service;
import com.project.jarihana.notificationdelivery.client.PushTransport;
import com.project.jarihana.notificationdelivery.client.dto.PushResult;
import com.project.jarihana.notificationdelivery.client.dto.PushResult.Outcome;
import com.project.jarihana.notificationdelivery.control.WorkerAdmissionController;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import com.project.jarihana.pushsubscription.config.PushProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class PushDeliveryWorker {
    private final PushDeliveryLeaseService leases;
    private final PushTransport transport;
    private final PushProperties properties;
    private final WorkerAdmissionController admission;
    private final MeterRegistry metrics;

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public int processDue() {
        if (!properties.enabled()) { return 0; }
        int count = 0;
        while (count < properties.batchSize()) {
            var permit = admission.tryAcquire();
            if (permit.isEmpty()) { break; }
            try (var admitted = permit.get()) {
                boolean claimed = processNext();
                admitted.complete();
                if (!claimed) { break; }
                count++;
            }
        }
        return count;
    }

    private boolean processNext() {
        var claim = leases.claimNext();
        if (claim.isEmpty()) { return false; }
        if (claim.get().status() != DeliveryStatus.IN_FLIGHT) { return true; }
        var request = leases.prepare(claim.get());
        if (request.isEmpty()) { return true; }
        PushResult result;
        try {
            result = transport.send(request.get());
        } catch (RuntimeException exception) {
            result = new PushResult(Outcome.RETRY, "TRANSPORT_ERROR", null);
        }
        metrics.counter("jarihana.push.requests", "outcome", result.outcome().name()).increment();
        if (result.outcome() != Outcome.ACCEPTED) {
            log.atWarn().addKeyValue("event.action", "push.request.failed")
                    .addKeyValue("jarihana.delivery_id", request.get().deliveryId())
                    .addKeyValue("jarihana.error_code", result.errorCode()).log("Push request failed");
        }
        if (!leases.finish(claim.get(), request.get(), result)) {
            throw new IllegalStateException("선점한 알림의 처리 결과를 저장하지 못했습니다.");
        }
        return true;
    }
}
