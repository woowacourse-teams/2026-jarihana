package com.project.jarihana.notificationdelivery.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.domain.Notification;
import com.project.jarihana.pushsubscription.domain.PushSubscription;
import jakarta.persistence.CheckConstraint;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

@Getter
@Entity
@Table(name = "notification_deliveries",
        uniqueConstraints = @UniqueConstraint(name = "uq_notification_deliveries_target",
                columnNames = {"notification_id", "push_subscription_id", "subscription_generation"}),
        check = @CheckConstraint(name = "ck_notification_deliveries_state",
                constraint = "subscription_generation > 0 AND attempt_count BETWEEN 0 AND 5 AND expires_at > created_at"
                        + " AND ((status = 'IN_FLIGHT' AND lease_token IS NOT NULL AND locked_until IS NOT NULL)"
                        + " OR (status <> 'IN_FLIGHT' AND lease_token IS NULL AND locked_until IS NULL))"
                        + " AND ((status = 'ACCEPTED' AND accepted_at IS NOT NULL) OR (status <> 'ACCEPTED' AND accepted_at IS NULL))"
                        + " AND ((status = 'PENDING' AND attempt_count = 0)"
                        + " OR (status IN ('IN_FLIGHT', 'ACCEPTED') AND attempt_count >= 1)"
                        + " OR (status = 'RETRY' AND attempt_count BETWEEN 1 AND 4)"
                        + " OR status IN ('FAILED', 'CANCELLED'))"))
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NotificationDelivery extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "notification_id", nullable = false, updatable = false)
    private Notification notification;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "push_subscription_id", nullable = false, updatable = false)
    private PushSubscription pushSubscription;

    @Column(name = "subscription_generation", nullable = false, updatable = false)
    private long subscriptionGeneration;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private DeliveryStatus status;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "next_attempt_at", nullable = false)
    private LocalDateTime nextAttemptAt;

    @Column(name = "expires_at", nullable = false, updatable = false)
    private LocalDateTime expiresAt;

    @Column(name = "lease_token")
    private UUID leaseToken;

    @Column(name = "locked_until")
    private LocalDateTime lockedUntil;

    @Column(name = "accepted_at")
    private LocalDateTime acceptedAt;

    @Column(name = "last_error_code", length = 50)
    private String lastErrorCode;

    private NotificationDelivery(Long id, Notification notification, PushSubscription pushSubscription,
                                 long subscriptionGeneration, DeliveryStatus status, int attemptCount,
                                 LocalDateTime nextAttemptAt, LocalDateTime expiresAt, String lastErrorCode,
                                 LocalDateTime createdAt) {
        super(Objects.requireNonNull(createdAt));
        this.id = id;
        this.notification = notification;
        this.pushSubscription = pushSubscription;
        this.subscriptionGeneration = subscriptionGeneration;
        this.status = status;
        this.attemptCount = attemptCount;
        this.nextAttemptAt = nextAttemptAt;
        this.expiresAt = expiresAt;
        this.lastErrorCode = lastErrorCode;
    }

    public static NotificationDelivery create(Notification notification, PushSubscription subscription,
                                              LocalDateTime now, LocalDateTime expiresAt) {
        Objects.requireNonNull(notification);
        Objects.requireNonNull(subscription);
        Objects.requireNonNull(now);
        Objects.requireNonNull(expiresAt);
        if (!subscription.isEnabled() || notification.getDeletedAt() != null
                || !sameMember(notification.getMember(), subscription.getMember()) || !expiresAt.isAfter(now)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "활성 구독과 같은 회원의 유효한 알림에만 전송 대기를 생성할 수 있습니다.");
        }
        return new NotificationDelivery(null, notification, subscription, subscription.getGeneration(),
                DeliveryStatus.PENDING, 0, now, expiresAt, null, now);
    }

    private static boolean sameMember(Member first, Member second) {
        return first == second || (first.getId() != null && first.getId().equals(second.getId()));
    }

    public NotificationDelivery cancel() {
        if (status == DeliveryStatus.ACCEPTED || status == DeliveryStatus.FAILED || status == DeliveryStatus.CANCELLED) {
            return this;
        }
        return new NotificationDelivery(id, notification, pushSubscription, subscriptionGeneration,
                DeliveryStatus.CANCELLED, attemptCount, nextAttemptAt, expiresAt, lastErrorCode, getCreatedAt());
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public boolean equals(Object object) {
        if (this == object) {
            return true;
        }
        if (!(object instanceof NotificationDelivery other)) {
            return false;
        }
        return id != null && other.id != null && id.equals(other.id);
    }
}
