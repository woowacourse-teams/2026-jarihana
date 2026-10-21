package com.project.jarihana.notification.command.service;

import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.group.domain.event.GroupCreatedEvent;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.invitation.domain.event.InvitationIssuedEvent;
import com.project.jarihana.notification.command.repository.NotificationCommandRepository;
import com.project.jarihana.notification.config.NotificationProperties;
import com.project.jarihana.notification.domain.Notification;
import com.project.jarihana.notification.domain.NotificationEventType;
import com.project.jarihana.notification.domain.NotificationPayload;
import com.project.jarihana.notification.domain.SystemRejectionReason;
import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import com.project.jarihana.pushsubscription.command.repository.PushSubscriptionCommandRepository;
import com.project.jarihana.pushsubscription.domain.PushSubscription;
import com.project.jarihana.registration.domain.event.RegistrationDecidedEvent;
import com.project.jarihana.registration.domain.event.RegistrationSubmittedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import tools.jackson.databind.json.JsonMapper;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class NotificationEventListener {

    private static final int INSERT_BATCH_SIZE = 50;

    private final NotificationCommandRepository notifications;
    private final NotificationDeliveryCommandRepository deliveries;
    private final PushSubscriptionCommandRepository subscriptions;
    private final MemberRepository members;
    private final JsonMapper json;
    private final NotificationProperties properties;

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT, fallbackExecution = false)
    public void onGroupCreated(GroupCreatedEvent event) {
        Map<Long, List<PushSubscription>> activeByMember = subscriptions.findActiveExceptCreator(event.creatorMemberId()).stream()
                .collect(Collectors.groupingBy(subscription -> subscription.getMember().getId(),
                        LinkedHashMap::new, Collectors.toList()));
        List<Member> recipients = activeByMember.values().stream().map(active -> active.getFirst().getMember()).toList();
        recordAll(recipients, "group:" + event.groupId() + ":created", NotificationEventType.GROUP_CREATED,
                NotificationPayload.forGroup(event.groupId()), event.occurredAt(), activeByMember);
    }

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
            case GROUP_CREATED -> throw new IllegalStateException("모임 등록 사건에는 신청 의미키를 사용할 수 없습니다.");
            case REGISTRATION_SUBMITTED -> "submitted";
            case PARTICIPANT_JOINED -> "joined";
            case REGISTRATION_APPROVED -> "approved";
            case REGISTRATION_REJECTED, REGISTRATION_SYSTEM_REJECTED -> "rejected";
            case INVITATION_RECEIVED -> throw new IllegalStateException("초대 사건은 신청 사건과 구분해야 합니다.");
        };
        String key = "registration:" + registrationId + ":" + suffix;
        record(member, key, type, payload, now, subscriptions.findActiveByMemberId(memberId));
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT, fallbackExecution = false)
    public void onInvitationIssued(InvitationIssuedEvent event) {
        Member member = members.findById(event.targetMemberId()).orElseThrow();
        record(member, "invitation:" + event.invitationId() + ":received", NotificationEventType.INVITATION_RECEIVED,
                NotificationPayload.invitation(event.groupId(), event.invitationId()), event.occurredAt(),
                subscriptions.findActiveByMemberId(event.targetMemberId()));
    }

    private void record(Member member, String key, NotificationEventType type, NotificationPayload payload,
                        LocalDateTime now, List<PushSubscription> activeSubscriptions) {
        recordAll(List.of(member), key, type, payload, now, Map.of(member.getId(), activeSubscriptions));
    }

    private void recordAll(List<Member> recipients, String key, NotificationEventType type, NotificationPayload payload,
                           LocalDateTime now, Map<Long, List<PushSubscription>> activeByMember) {
        if (recipients.isEmpty()) {
            return;
        }
        List<Notification> validated = recipients.stream()
                .map(member -> Notification.create(member, key, type, payload, now)).toList();
        String serializedPayload = json.writeValueAsString(payload);
        List<Notification> inserted = new ArrayList<>();
        for (int start = 0; start < validated.size(); start += INSERT_BATCH_SIZE) {
            List<Long> memberIds = validated.subList(start, Math.min(start + INSERT_BATCH_SIZE, validated.size())).stream()
                    .map(notification -> notification.getMember().getId()).toList();
            inserted.addAll(notifications.insertAllIfAbsentReturning(json.writeValueAsString(memberIds), key,
                    type.name(), validated.getFirst().getPayloadVersion(), serializedPayload, now));
        }

        LocalDateTime expiresAt = now.plus(properties.deliveryTtl());
        List<DeliveryInsert> targets = inserted.stream()
                .flatMap(notification -> activeByMember.get(notification.getMember().getId()).stream()
                        .map(subscription -> NotificationDelivery.create(notification, subscription, now, expiresAt)))
                .map(delivery -> new DeliveryInsert(delivery.getNotification().getId(),
                        delivery.getPushSubscription().getId(), delivery.getSubscriptionGeneration())).toList();
        for (int start = 0; start < targets.size(); start += INSERT_BATCH_SIZE) {
            List<DeliveryInsert> batch = targets.subList(start, Math.min(start + INSERT_BATCH_SIZE, targets.size()));
            deliveries.insertAllIfAbsent(json.writeValueAsString(batch), now, expiresAt);
        }
    }

    private record DeliveryInsert(long notificationId, long subscriptionId, long generation) {
    }
}
