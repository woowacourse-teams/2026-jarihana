package com.project.jarihana.registration.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RegistrationTest {

    private static final LocalDateTime GROUP_CREATED_AT = LocalDateTime.of(2026, 8, 10, 10, 0);
    private static final LocalDateTime STARTS_AT = LocalDateTime.of(2026, 8, 20, 10, 0);
    private static final LocalDateTime ENDS_AT = LocalDateTime.of(2026, 8, 27, 10, 0);
    private static final LocalDateTime REGISTERED_AT = STARTS_AT.plusHours(1);

    @DisplayName("승인제 모집 신청은 대기 상태로 생성한다.")
    @Test
    void createPendingRegistration() {
        // Given
        GroupRecruitment recruitment = recruitment(JoinMethod.APPROVAL, 3);
        Member member = member();

        // When
        Registration registration = Registration.createPending(
                recruitment,
                member,
                "함께하고 싶습니다.",
                REGISTERED_AT
        );

        // Then
        assertThat(registration.getRecruitment()).isSameAs(recruitment);
        assertThat(registration.getMember()).isSameAs(member);
        assertThat(registration.getStatus()).isEqualTo(RegistrationStatus.PENDING);
        assertThat(registration.getRejectReason()).isNull();
        assertThat(registration.getDecidedAt()).isNull();
        assertThat(registration.getDecidedBy()).isNull();
        assertThat(registration.canWithdraw()).isTrue();
    }

    private GroupRecruitment recruitment(JoinMethod joinMethod, int capacity) {
        return GroupRecruitment.create(activeGroup(), joinMethod, capacity, STARTS_AT, ENDS_AT);
    }

    private Group activeGroup() {
        return Group.createClub("러닝크루", "함께 달려요", null, null, null, GROUP_CREATED_AT);
    }

    private Member member() {
        return Member.create("우주", 8, "123456", Course.BACKEND);
    }

    @DisplayName("자동 모집 신청은 즉시 시스템 승인 상태로 생성한다.")
    @Test
    void createAutoApprovedRegistration() {
        // Given
        GroupRecruitment recruitment = recruitment(JoinMethod.AUTO, 3);

        // When
        Registration registration = Registration.createAutoApproved(
                recruitment,
                member(),
                null,
                REGISTERED_AT,
                2
        );

        // Then
        assertThat(registration.getStatus()).isEqualTo(RegistrationStatus.APPROVED);
        assertThat(registration.getDecidedAt()).isEqualTo(REGISTERED_AT);
        assertThat(registration.getDecidedBy()).isEqualTo(DecisionActor.system());
        assertThat(registration.canWithdraw()).isFalse();
    }

    @DisplayName("모집 방식과 다른 신청 생성 경로는 사용할 수 없다.")
    @Test
    void creationPathMustMatchJoinMethod() {
        // When & Then
        assertThatThrownBy(() -> Registration.createPending(
                recruitment(JoinMethod.AUTO, 3),
                member(),
                null,
                REGISTERED_AT
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
        assertThatThrownBy(() -> Registration.createAutoApproved(
                recruitment(JoinMethod.APPROVAL, 3),
                member(),
                null,
                REGISTERED_AT,
                0
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("마감된 모집 공고에는 신청할 수 없다.")
    @Test
    void closedRecruitmentCannotAcceptRegistration() {
        // Given
        GroupRecruitment recruitment = recruitment(JoinMethod.APPROVAL, 3);

        // When & Then
        assertThatThrownBy(() -> Registration.createPending(
                recruitment,
                member(),
                null,
                ENDS_AT
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("자동 모집은 남은 정원이 있을 때만 신청할 수 있다.")
    @Test
    void autoRecruitmentRequiresCapacity() {
        // When & Then
        assertThatThrownBy(() -> Registration.createAutoApproved(
                recruitment(JoinMethod.AUTO, 3),
                member(),
                null,
                REGISTERED_AT,
                3
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("신청 메시지는 1000자를 초과할 수 없다.")
    @Test
    void messageCannotExceedLimit() {
        // When & Then
        assertThatThrownBy(() -> Registration.createPending(
                recruitment(JoinMethod.APPROVAL, 3),
                member(),
                "가".repeat(1_001),
                REGISTERED_AT
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("대기 신청은 회원 결정 주체가 정원이 남은 경우 승인할 수 있고 원본을 유지한다.")
    @Test
    void approvePendingRegistrationImmutably() {
        // Given
        Registration original = pendingRegistration();
        DecisionActor actor = DecisionActor.member(10L);
        LocalDateTime decidedAt = REGISTERED_AT.plusDays(1);

        // When
        Registration approved = original.approve(actor, decidedAt, 2);

        // Then
        assertThat(approved.getStatus()).isEqualTo(RegistrationStatus.APPROVED);
        assertThat(approved.getDecidedAt()).isEqualTo(decidedAt);
        assertThat(approved.getDecidedBy()).isEqualTo(actor);
        assertThat(original.getStatus()).isEqualTo(RegistrationStatus.PENDING);
        assertThat(original.getDecidedAt()).isNull();
    }

    private Registration pendingRegistration() {
        return Registration.createPending(
                recruitment(JoinMethod.APPROVAL, 3),
                member(),
                null,
                REGISTERED_AT
        );
    }

    @DisplayName("시스템은 대기 신청을 수동 승인할 수 없다.")
    @Test
    void systemCannotManuallyApprove() {
        // When & Then
        assertThatThrownBy(() -> pendingRegistration().approve(
                DecisionActor.system(),
                REGISTERED_AT.plusDays(1),
                0
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("정원이 남지 않은 모집의 대기 신청은 승인할 수 없다.")
    @Test
    void approvalRequiresCapacity() {
        // When & Then
        assertThatThrownBy(() -> pendingRegistration().approve(
                DecisionActor.member(10L),
                REGISTERED_AT.plusDays(1),
                3
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("대기 신청은 회원 주체가 수동 거절하고 시스템이 자동 거절할 수 있다.")
    @Test
    void rejectPendingRegistration() {
        // Given
        Registration original = pendingRegistration();
        LocalDateTime decidedAt = REGISTERED_AT.plusDays(1);

        // When
        Registration manualRejected = original.reject(DecisionActor.member(10L), "모집 기준 불일치", decidedAt);
        Registration systemRejected = original.rejectBySystem(null, decidedAt);

        // Then
        assertThat(manualRejected.getStatus()).isEqualTo(RegistrationStatus.REJECTED);
        assertThat(manualRejected.getRejectReason()).isEqualTo("모집 기준 불일치");
        assertThat(systemRejected.getDecidedBy()).isEqualTo(DecisionActor.system());
        assertThat(original.getStatus()).isEqualTo(RegistrationStatus.PENDING);
    }

    @DisplayName("시스템 주체로 수동 거절할 수 없다.")
    @Test
    void systemCannotManuallyReject() {
        // When & Then
        assertThatThrownBy(() -> pendingRegistration().reject(
                DecisionActor.system(),
                null,
                REGISTERED_AT.plusDays(1)
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("거절 사유는 1000자를 초과할 수 없다.")
    @Test
    void rejectReasonCannotExceedLimit() {
        // When & Then
        assertThatThrownBy(() -> pendingRegistration().reject(
                DecisionActor.member(10L),
                "가".repeat(1_001),
                REGISTERED_AT.plusDays(1)
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("이미 결정된 신청은 다시 승인하거나 거절할 수 없다.")
    @Test
    void decidedRegistrationCannotChangeAgain() {
        // Given
        Registration approved = pendingRegistration().approve(
                DecisionActor.member(10L),
                REGISTERED_AT.plusDays(1),
                0
        );

        // When & Then
        assertThatThrownBy(() -> approved.approve(
                DecisionActor.member(10L),
                REGISTERED_AT.plusDays(2),
                0
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
        assertThatThrownBy(() -> approved.reject(
                DecisionActor.member(10L),
                "다시 거절",
                REGISTERED_AT.plusDays(2)
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }
}
