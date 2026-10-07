package com.project.jarihana.notificationdelivery.command.service;
import com.project.jarihana.notificationdelivery.client.PushTransport;
import com.project.jarihana.notificationdelivery.client.dto.PushResult;
import com.project.jarihana.notificationdelivery.client.dto.PushResult.Outcome;
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
    private final MeterRegistry metrics;

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public int processDue() {
        if (!properties.enabled()) { return 0; }
        int count = 0;
        while (count < properties.batchSize()) {
            var claim = leases.claimNext();
            if (claim.isEmpty()) { break; }
            count++;
            if (claim.get().status() != DeliveryStatus.IN_FLIGHT) { continue; }
            var request = leases.prepare(claim.get());
            if (request.isEmpty()) { continue; }
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
            leases.finish(claim.get(), request.get(), result);
        }
        return count;
    }
}
