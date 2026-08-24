package com.project.jarihana.registration.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "registration")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Registration extends BaseEntity {

    private static final int MESSAGE_MAX_LENGTH = 1_000;
    private static final int REJECT_REASON_MAX_LENGTH = 1_000;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recruitment_id", nullable = false)
    private GroupRecruitment recruitment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(name = "message", length = MESSAGE_MAX_LENGTH)
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private RegistrationStatus status;

    @Column(name = "reject_reason", length = REJECT_REASON_MAX_LENGTH)
    private String rejectReason;

    @Column(name = "registered_at", nullable = false)
    private LocalDateTime registeredAt;

    @Column(name = "decided_at")
    private LocalDateTime decidedAt;

    @Embedded
    private DecisionActor decidedBy;

    private Registration(
            Long id,
            GroupRecruitment recruitment,
            Member member,
            String message,
            RegistrationStatus status,
            String rejectReason,
            LocalDateTime registeredAt,
            LocalDateTime decidedAt,
            DecisionActor decidedBy
    ) {
        super(registeredAt);
        this.id = id;
        this.recruitment = require(recruitment, "모집 공고");
        this.member = require(member, "회원");
        this.message = validateNullableLength(message, MESSAGE_MAX_LENGTH, "신청 메시지");
        this.status = require(status, "신청 상태");
        this.rejectReason = validateNullableLength(rejectReason, REJECT_REASON_MAX_LENGTH, "거절 사유");
        this.registeredAt = require(registeredAt, "신청 시각");
        this.decidedAt = decidedAt;
        this.decidedBy = decidedBy;
        validateDecisionState(status, rejectReason, decidedAt, decidedBy);
    }

    private static void validateDecisionState(
            RegistrationStatus status,
            String rejectReason,
            LocalDateTime decidedAt,
            DecisionActor decidedBy
    ) {
        if (status == RegistrationStatus.PENDING) {
            if (rejectReason != null || decidedAt != null || decidedBy != null) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "대기 신청에는 결정 정보가 있을 수 없습니다.");
            }
            return;
        }
        if (decidedAt == null || decidedBy == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "결정된 신청에는 결정 시각과 주체가 필요합니다.");
        }
        if (status == RegistrationStatus.APPROVED && rejectReason != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "승인 신청에는 거절 사유가 있을 수 없습니다.");
        }
    }

    private static String validateNullableLength(String value, int maxLength, String fieldName) {
        if (value != null && value.length() > maxLength) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, fieldName + "은 " + maxLength + "자 이하여야 합니다.");
        }
        return value;
    }

    private static <T> T require(T value, String fieldName) {
        if (value == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, fieldName + "은 필수입니다.");
        }
        return value;
    }

    public static Registration createPending(
            GroupRecruitment recruitment,
            Member member,
            String message,
            LocalDateTime registeredAt
    ) {
        validateJoinMethod(recruitment, JoinMethod.APPROVAL);
        validateRecruitmentOpen(recruitment, registeredAt);
        return new Registration(
                null,
                recruitment,
                member,
                message,
                RegistrationStatus.PENDING,
                null,
                registeredAt,
                null,
                null
        );
    }

    private static void validateJoinMethod(GroupRecruitment recruitment, JoinMethod expected) {
        GroupRecruitment requiredRecruitment = require(recruitment, "모집 공고");
        if (requiredRecruitment.getJoinMethod() != expected) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "모집 방식과 신청 생성 경로가 일치하지 않습니다.");
        }
    }

    private static void validateRecruitmentOpen(
            GroupRecruitment recruitment,
            LocalDateTime registeredAt
    ) {
        LocalDateTime requiredRegisteredAt = require(registeredAt, "신청 시각");
        if (!recruitment.isOpenAt(requiredRegisteredAt)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "모집 중인 공고에만 신청할 수 있습니다.");
        }
    }

    public static Registration createAutoApproved(
            GroupRecruitment recruitment,
            Member member,
            String message,
            LocalDateTime registeredAt,
            int approvedCount
    ) {
        validateJoinMethod(recruitment, JoinMethod.AUTO);
        validateRecruitmentOpen(recruitment, registeredAt);
        if (!recruitment.hasCapacity(approvedCount)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "모집 정원이 남아 있지 않습니다.");
        }
        return new Registration(
                null,
                recruitment,
                member,
                message,
                RegistrationStatus.APPROVED,
                null,
                registeredAt,
                registeredAt,
                DecisionActor.system()
        );
    }

    public Registration approve(DecisionActor actor, LocalDateTime decidedAt, int approvedCount) {
        requirePending();
        DecisionActor requiredActor = require(actor, "결정 주체");
        if (requiredActor.getType() != DecisionActorType.MEMBER) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "수동 승인은 회원 결정 주체만 수행할 수 있습니다.");
        }
        if (!recruitment.hasCapacity(approvedCount)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "모집 정원이 남아 있지 않습니다.");
        }
        return decided(RegistrationStatus.APPROVED, null, require(decidedAt, "결정 시각"), requiredActor);
    }

    private Registration decided(
            RegistrationStatus status,
            String rejectReason,
            LocalDateTime decidedAt,
            DecisionActor decidedBy
    ) {
        return new Registration(
                id,
                recruitment,
                member,
                message,
                status,
                rejectReason,
                registeredAt,
                decidedAt,
                decidedBy
        );
    }

    private void requirePending() {
        if (status != RegistrationStatus.PENDING) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "PENDING 상태의 신청만 결정할 수 있습니다.");
        }
    }

    public Registration reject(DecisionActor actor, String reason, LocalDateTime decidedAt) {
        requirePending();
        DecisionActor requiredActor = require(actor, "결정 주체");
        if (requiredActor.getType() != DecisionActorType.MEMBER) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "수동 거절은 회원 결정 주체만 수행할 수 있습니다.");
        }
        return rejected(requiredActor, reason, decidedAt);
    }

    private Registration rejected(DecisionActor actor, String reason, LocalDateTime decidedAt) {
        String validatedReason = validateNullableLength(reason, REJECT_REASON_MAX_LENGTH, "거절 사유");
        return decided(
                RegistrationStatus.REJECTED,
                validatedReason,
                require(decidedAt, "결정 시각"),
                actor
        );
    }

    public Registration rejectBySystem(String reason, LocalDateTime decidedAt) {
        requirePending();
        return rejected(DecisionActor.system(), reason, decidedAt);
    }

    public boolean canWithdraw() {
        return status == RegistrationStatus.PENDING;
    }

    public Long getId() {
        return id;
    }

    public GroupRecruitment getRecruitment() {
        return recruitment;
    }

    public Member getMember() {
        return member;
    }

    public String getMessage() {
        return message;
    }

    public RegistrationStatus getStatus() {
        return status;
    }

    public String getRejectReason() {
        return rejectReason;
    }

    public LocalDateTime getRegisteredAt() {
        return registeredAt;
    }

    public LocalDateTime getDecidedAt() {
        return decidedAt;
    }

    public DecisionActor getDecidedBy() {
        return decidedBy;
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
        if (!(object instanceof Registration other)) {
            return false;
        }
        if (id == null || other.id == null) {
            return false;
        }
        return id.equals(other.id);
    }
}
