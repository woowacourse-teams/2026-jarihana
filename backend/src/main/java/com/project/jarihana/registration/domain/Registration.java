package com.project.jarihana.registration.domain;

import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import java.time.LocalDateTime;

public final class Registration {

    private static final int MESSAGE_MAX_LENGTH = 1_000;
    private static final int REJECT_REASON_MAX_LENGTH = 1_000;

    private final Long id;
    private final GroupRecruitment recruitment;
    private final Member member;
    private final String message;
    private final RegistrationStatus status;
    private final String rejectReason;
    private final LocalDateTime registeredAt;
    private final LocalDateTime decidedAt;
    private final DecisionActor decidedBy;

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
            throw new IllegalStateException("모집 정원이 남아 있지 않습니다.");
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
            throw new IllegalArgumentException("수동 승인은 회원 결정 주체만 수행할 수 있습니다.");
        }
        if (!recruitment.hasCapacity(approvedCount)) {
            throw new IllegalStateException("모집 정원이 남아 있지 않습니다.");
        }
        return decided(RegistrationStatus.APPROVED, null, require(decidedAt, "결정 시각"), requiredActor);
    }

    public Registration reject(DecisionActor actor, String reason, LocalDateTime decidedAt) {
        requirePending();
        DecisionActor requiredActor = require(actor, "결정 주체");
        if (requiredActor.getType() != DecisionActorType.MEMBER) {
            throw new IllegalArgumentException("수동 거절은 회원 결정 주체만 수행할 수 있습니다.");
        }
        return rejected(requiredActor, reason, decidedAt);
    }

    public Registration rejectBySystem(String reason, LocalDateTime decidedAt) {
        requirePending();
        return rejected(DecisionActor.system(), reason, decidedAt);
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

    public boolean canWithdraw() {
        return status == RegistrationStatus.PENDING;
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
            throw new IllegalStateException("PENDING 상태의 신청만 결정할 수 있습니다.");
        }
    }

    private static void validateJoinMethod(GroupRecruitment recruitment, JoinMethod expected) {
        GroupRecruitment requiredRecruitment = require(recruitment, "모집 공고");
        if (requiredRecruitment.getJoinMethod() != expected) {
            throw new IllegalArgumentException("모집 방식과 신청 생성 경로가 일치하지 않습니다.");
        }
    }

    private static void validateRecruitmentOpen(
            GroupRecruitment recruitment,
            LocalDateTime registeredAt
    ) {
        LocalDateTime requiredRegisteredAt = require(registeredAt, "신청 시각");
        if (!recruitment.isOpenAt(requiredRegisteredAt)) {
            throw new IllegalStateException("모집 중인 공고에만 신청할 수 있습니다.");
        }
    }

    private static void validateDecisionState(
            RegistrationStatus status,
            String rejectReason,
            LocalDateTime decidedAt,
            DecisionActor decidedBy
    ) {
        if (status == RegistrationStatus.PENDING) {
            if (rejectReason != null || decidedAt != null || decidedBy != null) {
                throw new IllegalArgumentException("대기 신청에는 결정 정보가 있을 수 없습니다.");
            }
            return;
        }
        if (decidedAt == null || decidedBy == null) {
            throw new IllegalArgumentException("결정된 신청에는 결정 시각과 주체가 필요합니다.");
        }
        if (status == RegistrationStatus.APPROVED && rejectReason != null) {
            throw new IllegalArgumentException("승인 신청에는 거절 사유가 있을 수 없습니다.");
        }
    }

    private static String validateNullableLength(String value, int maxLength, String fieldName) {
        if (value != null && value.length() > maxLength) {
            throw new IllegalArgumentException(fieldName + "은 " + maxLength + "자 이하여야 합니다.");
        }
        return value;
    }

    private static <T> T require(T value, String fieldName) {
        if (value == null) {
            throw new IllegalArgumentException(fieldName + "은 필수입니다.");
        }
        return value;
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
}
