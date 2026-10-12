package com.project.jarihana.notification.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Member;
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
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Objects;

@Getter
@Entity
@Table(name = "notifications",
        uniqueConstraints = @UniqueConstraint(name = "uq_notifications_event_member", columnNames = {"event_key", "member_id"}),
        check = @CheckConstraint(name = "ck_notifications_payload",
                constraint = "payload_version > 0 AND jsonb_typeof(payload) = 'object' AND length(trim(event_key)) > 0"))
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Notification extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(name = "event_key", nullable = false, length = 160, updatable = false)
    private String eventKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 50, updatable = false)
    private NotificationEventType eventType;

    @JdbcTypeCode(SqlTypes.SMALLINT)
    @Column(name = "payload_version", nullable = false, updatable = false)
    private int payloadVersion;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload", nullable = false, columnDefinition = "jsonb", updatable = false)
    private NotificationPayload payload;

    @Column(name = "read_at")
    private LocalDateTime readAt;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    private Notification(Long id, Member member, String eventKey, NotificationEventType eventType,
                         int payloadVersion, NotificationPayload payload, LocalDateTime readAt, LocalDateTime deletedAt,
                         LocalDateTime createdAt) {
        super(Objects.requireNonNull(createdAt));
        if (eventKey == null || eventKey.isBlank() || eventKey.length() > 160) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "알림 사건 의미키는 1자부터 160자까지여야 합니다.");
        }
        Objects.requireNonNull(eventType);
        Objects.requireNonNull(payload);
        if ((eventType == NotificationEventType.GROUP_CREATED) != (payload.getRegistrationId() == null)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "모임 등록 알림 외에는 모집과 신청 식별자가 필요합니다.");
        }
        if ((eventType == NotificationEventType.REGISTRATION_SYSTEM_REJECTED) != (payload.getReasonCode() != null)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "시스템 미승인 알림에만 원인 분류가 필요합니다.");
        }
        this.id = id;
        this.member = Objects.requireNonNull(member);
        this.eventKey = eventKey;
        this.eventType = eventType;
        this.payloadVersion = payloadVersion;
        this.payload = payload;
        this.readAt = readAt;
        this.deletedAt = deletedAt;
    }

    public static Notification create(Member member, String eventKey, NotificationEventType eventType,
                                      NotificationPayload payload, LocalDateTime now) {
        return new Notification(null, member, eventKey, eventType, 1, payload, null, null, now);
    }

    public Notification markRead(LocalDateTime now) {
        if (readAt != null || deletedAt != null) {
            return this;
        }
        return new Notification(id, member, eventKey, eventType, payloadVersion, payload,
                Objects.requireNonNull(now), deletedAt, getCreatedAt());
    }

    public Notification delete(LocalDateTime now) {
        if (deletedAt != null) {
            return this;
        }
        return new Notification(id, member, eventKey, eventType, payloadVersion, payload,
                readAt, Objects.requireNonNull(now), getCreatedAt());
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
        if (!(object instanceof Notification other)) {
            return false;
        }
        return id != null && other.id != null && id.equals(other.id);
    }
}
