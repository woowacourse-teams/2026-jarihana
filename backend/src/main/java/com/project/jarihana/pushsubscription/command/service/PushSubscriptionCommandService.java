package com.project.jarihana.pushsubscription.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.pushsubscription.command.repository.PushSubscriptionCommandRepository;
import com.project.jarihana.pushsubscription.command.service.dto.RegisterPushSubscriptionCommand;
import com.project.jarihana.pushsubscription.command.service.dto.PushSubscriptionResult;
import com.project.jarihana.pushsubscription.config.PushProperties;
import com.project.jarihana.pushsubscription.domain.PushEndpointPolicy;
import com.project.jarihana.pushsubscription.domain.PushSubscription;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class PushSubscriptionCommandService {
    private final PushSubscriptionCommandRepository subscriptions;
    private final NotificationDeliveryCommandRepository deliveries;
    private final MemberRepository members;
    private final PushEndpointPolicy endpoints;
    private final PushProperties properties;
    private final Clock clock;

    @Transactional
    public PushSubscriptionResult registerSubscription(long memberId, RegisterPushSubscriptionCommand command) {
        var member = members.findById(memberId).orElseThrow(PushSubscriptionCommandService::unauthenticated);
        if (!properties.enabled()) {
            throw new BusinessException(ErrorCode.PUSH_UNAVAILABLE, "현재 웹푸시를 사용할 수 없습니다.");
        }
        endpoints.validate(command.endpoint());
        LocalDateTime now = LocalDateTime.now(clock);
        PushSubscription validated = PushSubscription.create(member, command.endpoint(), command.p256dh(), command.auth(), now);
        int inserted = subscriptions.insertIfAbsent(memberId, validated.getEndpoint(), validated.getP256dh(), validated.getAuth(), now);
        PushSubscription existing = subscriptions.findWithLockByEndpoint(command.endpoint()).orElseThrow();
        if (existing.getMember().getId() != memberId) {
            throw new BusinessException(ErrorCode.PUSH_SUBSCRIPTION_CONFLICT, "다른 계정에 연결된 푸시 주소입니다.");
        }
        long previousGeneration = existing.getGeneration();
        PushSubscription updated = subscriptions.save(existing.reconnect(command.p256dh(), command.auth(), now));
        if (updated.getGeneration() != previousGeneration) {
            deliveries.cancelBySubscriptionBeforeGeneration(updated.getId(), updated.getGeneration(), now);
        }
        return PushSubscriptionResult.from(updated, inserted == 1);
    }

    @Transactional
    public void disconnectSubscription(long memberId, long id) {
        disconnectSubscription(memberId, id, null);
    }

    @Transactional
    public void disconnectSubscription(long memberId, long id, Long expectedGeneration) {
        members.findById(memberId).orElseThrow(PushSubscriptionCommandService::unauthenticated);
        if (id <= 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "구독 식별자는 양수여야 합니다.");
        }
        PushSubscription existing = subscriptions.findWithLockByIdAndMemberId(id, memberId)
                .orElseThrow(PushSubscriptionCommandService::notFound);
        if (expectedGeneration != null && expectedGeneration != existing.getGeneration()) {
            throw notFound();
        }
        PushSubscription disabled = subscriptions.save(existing.disable(LocalDateTime.now(clock)));
        deliveries.cancelBySubscriptionBeforeGeneration(id, disabled.getGeneration(), LocalDateTime.now(clock));
    }

    private static BusinessException unauthenticated() {
        return new BusinessException(ErrorCode.UNAUTHENTICATED, "인증 정보가 필요합니다.");
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.PUSH_SUBSCRIPTION_NOT_FOUND, "푸시 구독을 찾을 수 없습니다.");
    }
}
