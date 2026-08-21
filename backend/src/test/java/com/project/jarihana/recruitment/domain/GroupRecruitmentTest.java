package com.project.jarihana.recruitment.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class GroupRecruitmentTest {

    private static final LocalDateTime GROUP_CREATED_AT = LocalDateTime.of(2026, 8, 10, 10, 0);
    private static final LocalDateTime STARTS_AT = LocalDateTime.of(2026, 8, 20, 10, 0);
    private static final LocalDateTime ENDS_AT = LocalDateTime.of(2026, 8, 27, 10, 0);

    @DisplayName("활동 중인 그룹에 모집 공고를 생성한다.")
    @Test
    void createRecruitment() {
        // Given
        Group group = activeGroup();

        // When
        GroupRecruitment recruitment = GroupRecruitment.create(
                group,
                JoinMethod.APPROVAL,
                3,
                STARTS_AT,
                ENDS_AT
        );

        // Then
        assertThat(recruitment.getGroup()).isSameAs(group);
        assertThat(recruitment.getJoinMethod()).isEqualTo(JoinMethod.APPROVAL);
        assertThat(recruitment.getCapacity()).isEqualTo(3);
        assertThat(recruitment.getStartsAt()).isEqualTo(STARTS_AT);
        assertThat(recruitment.getEndsAt()).isEqualTo(ENDS_AT);
    }

    @DisplayName("종료된 그룹에는 모집 공고를 만들 수 없다.")
    @Test
    void endedGroupCannotCreateRecruitment() {
        // Given
        Group endedGroup = activeGroup().endAt(GROUP_CREATED_AT.plusHours(25));

        // When & Then
        assertThatThrownBy(() -> GroupRecruitment.create(
                endedGroup,
                JoinMethod.APPROVAL,
                3,
                STARTS_AT,
                ENDS_AT
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("모집 인원은 1명 이상이어야 한다.")
    @Test
    void capacityMustBePositive() {
        // When & Then
        assertThatThrownBy(() -> GroupRecruitment.create(
                activeGroup(),
                JoinMethod.APPROVAL,
                0,
                STARTS_AT,
                ENDS_AT
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("모집 종료 시각은 시작 시각보다 빠를 수 없다.")
    @Test
    void endsAtCannotBeBeforeStartsAt() {
        // When & Then
        assertThatThrownBy(() -> GroupRecruitment.create(
                activeGroup(),
                JoinMethod.APPROVAL,
                3,
                STARTS_AT,
                STARTS_AT.minusNanos(1)
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode().name())
                .isEqualTo("RECRUITMENT_INVALID_PERIOD");
    }

    @DisplayName("현재 시각과 모집 기간으로 모집 단계를 계산한다.")
    @Test
    void calculateRecruitmentPhase() {
        // Given
        GroupRecruitment recruitment = recruitment(JoinMethod.APPROVAL, 3, ENDS_AT);

        // When & Then
        assertThat(recruitment.phaseAt(STARTS_AT.minusNanos(1))).isEqualTo(RecruitmentPhase.UPCOMING);
        assertThat(recruitment.phaseAt(STARTS_AT)).isEqualTo(RecruitmentPhase.OPEN);
        assertThat(recruitment.phaseAt(ENDS_AT.minusNanos(1))).isEqualTo(RecruitmentPhase.OPEN);
        assertThat(recruitment.phaseAt(ENDS_AT)).isEqualTo(RecruitmentPhase.CLOSED);
    }

    @DisplayName("종료 시각이 없는 공고는 시작 전에는 예정이고 시작 후에는 상시 모집이다.")
    @Test
    void calculateAlwaysOpenPhase() {
        // Given
        GroupRecruitment recruitment = recruitment(JoinMethod.AUTO, 3, null);

        // When & Then
        assertThat(recruitment.phaseAt(STARTS_AT.minusNanos(1))).isEqualTo(RecruitmentPhase.UPCOMING);
        assertThat(recruitment.phaseAt(STARTS_AT)).isEqualTo(RecruitmentPhase.ALWAYS_OPEN);
        assertThat(recruitment.isOpenAt(STARTS_AT.plusYears(1))).isTrue();
    }

    @DisplayName("승인 인원이 정원보다 적을 때만 자리가 있다.")
    @Test
    void checkCapacityByApprovedCount() {
        // Given
        GroupRecruitment recruitment = recruitment(JoinMethod.APPROVAL, 3, ENDS_AT);

        // When & Then
        assertThat(recruitment.hasCapacity(2)).isTrue();
        assertThat(recruitment.hasCapacity(3)).isFalse();
        assertThatThrownBy(() -> recruitment.hasCapacity(-1))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("모집 시작 전 조기 마감하면 시작과 종료 시각을 현재 시각으로 맞추고 원본을 유지한다.")
    @Test
    void closeUpcomingRecruitmentImmutably() {
        // Given
        GroupRecruitment original = recruitment(JoinMethod.APPROVAL, 3, ENDS_AT);
        LocalDateTime now = STARTS_AT.minusDays(1);

        // When
        GroupRecruitment closed = original.closeAt(now);

        // Then
        assertThat(closed.getStartsAt()).isEqualTo(now);
        assertThat(closed.getEndsAt()).isEqualTo(now);
        assertThat(closed.phaseAt(now)).isEqualTo(RecruitmentPhase.CLOSED);
        assertThat(original.getStartsAt()).isEqualTo(STARTS_AT);
        assertThat(original.getEndsAt()).isEqualTo(ENDS_AT);
    }

    @DisplayName("승인 인원이 정원에 도달하면 모집을 마감한다.")
    @Test
    void closeRecruitmentIfFull() {
        // Given
        GroupRecruitment original = recruitment(JoinMethod.APPROVAL, 3, ENDS_AT);
        LocalDateTime now = STARTS_AT.plusDays(1);

        // When
        GroupRecruitment notFull = original.closeIfFull(2, now);
        GroupRecruitment full = original.closeIfFull(3, now);

        // Then
        assertThat(notFull).isSameAs(original);
        assertThat(full.getEndsAt()).isEqualTo(now);
        assertThat(original.getEndsAt()).isEqualTo(ENDS_AT);
    }

    @DisplayName("이미 마감된 모집 공고는 다시 마감할 수 없다.")
    @Test
    void closedRecruitmentCannotCloseAgain() {
        // Given
        GroupRecruitment closed = recruitment(JoinMethod.APPROVAL, 3, ENDS_AT)
                .closeAt(STARTS_AT.plusDays(1));

        // When & Then
        assertThatThrownBy(() -> closed.closeAt(STARTS_AT.plusDays(2)))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    private GroupRecruitment recruitment(JoinMethod joinMethod, int capacity, LocalDateTime endsAt) {
        return GroupRecruitment.create(activeGroup(), joinMethod, capacity, STARTS_AT, endsAt);
    }

    private Group activeGroup() {
        return Group.createClub("러닝크루", "함께 달려요", null, null, null, GROUP_CREATED_AT);
    }
}
