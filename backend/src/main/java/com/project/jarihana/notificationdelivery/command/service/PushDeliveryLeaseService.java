package com.project.jarihana.notificationdelivery.command.service;

import com.project.jarihana.notificationdelivery.client.dto.PushRequest;
import com.project.jarihana.notificationdelivery.client.dto.PushResult;
import com.project.jarihana.notificationdelivery.client.dto.PushResult.Outcome;
import com.project.jarihana.notificationdelivery.command.repository.PushDeliveryWorkRepository;
import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.notificationdelivery.command.repository.dto.DeliveryClaim;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import com.project.jarihana.pushsubscription.command.repository.PushSubscriptionCommandRepository;
import com.project.jarihana.pushsubscription.config.PushProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PushDeliveryLeaseService {
    private final PushDeliveryWorkRepository work;
    private final NotificationDeliveryCommandRepository deliveries;
    private final PushSubscriptionCommandRepository subscriptions;
    private final PushProperties properties;
    private final Clock clock;

    @Transactional
    public Optional<DeliveryClaim> claimNext() {
        return claimNext(1).stream().findFirst();
    }

    @Transactional
    public List<DeliveryClaim> claimNext(int limit) {
        if (limit < 0) {
            throw new IllegalArgumentException("Claim limit must not be negative");
        }
        LocalDateTime now = LocalDateTime.now(clock);
        return work.claimNext(now, now.plus(properties.leaseDuration()), limit);
    }

    @Transactional
    public Optional<PushRequest> prepare(DeliveryClaim claim) {
        return prepare(List.of(claim)).stream().findFirst();
    }

    @Transactional
    public List<PushRequest> prepare(List<DeliveryClaim> claims) {
        LocalDateTime now = LocalDateTime.now(clock);
        var result = work.findSendable(claims, now);
        var sendableIds = result.stream().map(PushRequest::deliveryId).collect(Collectors.toSet());
        work.cancelUnsendable(claims.stream().filter(claim -> !sendableIds.contains(claim.id())).toList(), now);
        return result;
    }

    @Transactional
    public void finish(DeliveryClaim claim, PushRequest request, PushResult result) {
        var subscription = subscriptions.findWithLockById(request.subscriptionId()).orElseThrow();
        LocalDateTime now = LocalDateTime.now(clock);
        if (!subscription.isEnabled() || subscription.getGeneration() != request.generation()) {
            work.finish(claim, DeliveryStatus.CANCELLED, now, "STALE_TARGET", now);
            return;
        }
        int attempts = claim.attemptCount();
        Duration delay = properties.retryDelay().multipliedBy(1L << Math.min(attempts - 1, 4));
        if (result.retryAfter() != null && result.retryAfter().compareTo(delay) > 0) { delay = result.retryAfter(); }
        boolean canRetry = attempts < 5 && delay.compareTo(Duration.between(now, request.expiresAt())) < 0;
        LocalDateTime next = canRetry ? now.plus(delay) : now;
        DeliveryStatus status = switch (result.outcome()) {
            case ACCEPTED -> DeliveryStatus.ACCEPTED;
            case RETRY -> canRetry ? DeliveryStatus.RETRY : DeliveryStatus.FAILED;
            case GONE, FAILED -> DeliveryStatus.FAILED;
        };
        if (!now.isBefore(request.expiresAt()) && result.outcome() != Outcome.ACCEPTED) { status = DeliveryStatus.FAILED; }
        int updated = work.finish(claim, status, status == DeliveryStatus.RETRY ? next : now, result.errorCode(), now);
        if (updated == 1 && result.outcome() == Outcome.GONE) {
            var disabled = subscriptions.save(subscription.disable(now));
            deliveries.cancelBySubscriptionBeforeGeneration(disabled.getId(), disabled.getGeneration(), now);
        }
    }
}
