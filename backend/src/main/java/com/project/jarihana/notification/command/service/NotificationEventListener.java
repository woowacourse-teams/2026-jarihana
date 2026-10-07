package com.project.jarihana.notification.command.service;

import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.command.repository.NotificationCommandRepository;
import com.project.jarihana.notification.config.NotificationProperties;
import com.project.jarihana.notification.domain.Notification;
import com.project.jarihana.notification.domain.NotificationEventType;
import com.project.jarihana.notification.domain.NotificationPayload;
import com.project.jarihana.notification.domain.SystemRejectionReason;
import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import com.project.jarihana.pushsubscription.command.repository.PushSubscriptionCommandRepository;
import com.project.jarihana.registration.domain.event.RegistrationDecidedEvent;
import com.project.jarihana.registration.domain.event.RegistrationSubmittedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import tools.jackson.databind.json.JsonMapper;

import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
public class NotificationEventListener {

    private final NotificationCommandRepository notifications;
    private final NotificationDeliveryCommandRepository deliveries;
    private final PushSubscriptionCommandRepository subscriptions;
    private final MemberRepository members;
    private final JsonMapper json;
    private final NotificationProperties properties;

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT, fallbackExecution = false)
    public void onSubmitted(RegistrationSubmittedEvent event) {
        NotificationEventType type = event.automaticallyApproved()
                ? NotificationEventType.PARTICIPANT_JOINED : NotificationEventType.REGISTRATION_SUBMITTED;
        record(event.leaderMemberId(), event.registrationId(), type,
                NotificationPayload.of(event.groupId(), event.recruitmentId(), event.registrationId(), null), event.occurredAt());
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT, fallbackExecution = false)
    public void onDecided(RegistrationDecidedEvent event) {
        NotificationEventType type = switch (event.status()) {
            case APPROVED -> NotificationEventType.REGISTRATION_APPROVED;
            case REJECTED -> event.systemReason() == null
                    ? NotificationEventType.REGISTRATION_REJECTED : NotificationEventType.REGISTRATION_SYSTEM_REJECTED;
            case PENDING -> throw new IllegalStateException("대기 신청은 결정 사건이 아닙니다.");
        };
        SystemRejectionReason reason = event.systemReason() == null ? null : switch (event.systemReason()) {
            case RERECRUITMENT -> SystemRejectionReason.RERECRUITMENT;
            case GROUP_ENDED -> SystemRejectionReason.GROUP_ENDED;
        };
        record(event.applicantMemberId(), event.registrationId(), type,
                NotificationPayload.of(event.groupId(), event.recruitmentId(), event.registrationId(), reason), event.occurredAt());
    }

    private void record(long memberId, long registrationId, NotificationEventType type,
                        NotificationPayload payload, LocalDateTime now) {
        Member member = members.findById(memberId).orElseThrow();
        String suffix = switch (type) {
            case REGISTRATION_SUBMITTED -> "submitted";
            case PARTICIPANT_JOINED -> "joined";
            case REGISTRATION_APPROVED -> "approved";
            case REGISTRATION_REJECTED, REGISTRATION_SYSTEM_REJECTED -> "rejected";
        };
        String key = "registration:" + registrationId + ":" + suffix;
        Notification validated = Notification.create(member, key, type, payload, now);
        int inserted = notifications.insertIfAbsent(memberId, key, type.name(), validated.getPayloadVersion(),
                json.writeValueAsString(validated.getPayload()), now);
        if (inserted == 0) {
            return;
        }
        Notification notification = notifications.findByEventKeyAndMemberId(key, memberId).orElseThrow();
        subscriptions.findActiveByMemberId(memberId).forEach(subscription -> deliveries.save(
                NotificationDelivery.create(notification, subscription, now, now.plus(properties.deliveryTtl()))));
    }
}
