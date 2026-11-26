package com.project.jarihana.group.domain;

import com.project.jarihana.member.domain.VerifiedAffiliations;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GroupTest {

    private static final LocalDateTime CREATED_AT = LocalDateTime.of(2026, 8, 18, 10, 0);
    private static final long WOOTECO = 1L;
    private static final long OTHER = 2L;

    @DisplayName("동아리와 스터디는 반복 일정 없이 유동 일정으로 생성할 수 있다.")
    @Test
    void createFlexibleRecurringGroups() {
        // When
        Group club = Group.createClub("러닝크루", "함께 달려요", null, null, null, CREATED_AT);
        Group study = Group.createStudy("자바스터디", "자바를 공부해요", null, null, null, CREATED_AT);

        // Then
        assertThat(club.getType()).isEqualTo(GroupType.CLUB);
        assertThat(study.getType()).isEqualTo(GroupType.STUDY);
        assertThat(club.getMeetingType().name()).isEqualTo("FLEXIBLE");
        assertThat(study.getMeetingType().name()).isEqualTo("FLEXIBLE");
        assertThat(club.getRecurringSchedule()).isNull();
        assertThat(study.getRecurringSchedule()).isNull();
        assertThat(club.getStatus()).isEqualTo(GroupStatus.ACTIVE);
    }

    @DisplayName("모임 방식은 null일 수 없다.")
    @Test
    void meetingTypeIsRequired() {
        // When & Then
        assertThatThrownBy(() -> Group.createClub(
                "러닝크루",
                "함께 달려요",
                null,
                null,
                null,
                null,
                recurringSchedule(),
                CREATED_AT
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("세션은 일회성 일정이 반드시 필요하다.")
    @Test
    void sessionScheduleIsRequired() {
        // When & Then
        assertThatThrownBy(() -> Group.createSession(
                "성능세션",
                "성능 이야기를 나눠요",
                null,
                null,
                null,
                CREATED_AT
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("세션은 일회성 일정과 함께 생성한다.")
    @Test
    void createSession() {
        // Given
        SessionGroupSchedule schedule = sessionSchedule();

        // When
        Group group = Group.createSession(
                "성능세션",
                "성능 이야기를 나눠요",
                "상세 설명",
                "groups/performance.png",
                schedule,
                CREATED_AT
        );

        // Then
        assertThat(group.getType()).isEqualTo(GroupType.SESSION);
        assertThat(group.getSessionSchedule()).isEqualTo(schedule);
        assertThat(group.getRecurringSchedule()).isNull();
    }

    private SessionGroupSchedule sessionSchedule() {
        return SessionGroupSchedule.of(
                LocalDate.of(2026, 8, 30),
                LocalTime.of(14, 0),
                LocalTime.of(16, 0)
        );
    }

    @DisplayName("그룹 이름과 소개의 길이를 검증한다.")
    @Test
    void validateNameAndIntroductionLength() {
        // When & Then
        assertThatThrownBy(() -> Group.createClub("", "소개", null, null, null, CREATED_AT))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
        assertThatThrownBy(() -> Group.createClub("이름", " ", null, null, null, CREATED_AT))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
        assertThatThrownBy(() -> Group.createClub("가".repeat(51), "소개", null, null, null, CREATED_AT))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
        assertThatThrownBy(() -> Group.createClub("이름", "가".repeat(101), null, null, null, CREATED_AT))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
        Group groupWithMaximumDescription = Group.createClub(
                "이름",
                "소개",
                "가".repeat(10_000),
                null,
                null,
                CREATED_AT
        );
        assertThat(groupWithMaximumDescription.getDescription()).hasSize(10_000);
        assertThatThrownBy(() -> Group.createClub("이름", "소개", "가".repeat(10_001), null, null, CREATED_AT))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("활동 중인 동아리는 같은 유형의 일정 조합으로 수정하고 원본을 유지한다.")
    @Test
    void modifyActiveClubImmutably() {
        // Given
        Group original = Group.createClub("러닝크루", "함께 달려요", null, null, null, CREATED_AT);
        RecurringGroupSchedule schedule = recurringSchedule();

        // When
        Group modified = original.modify(
                "새 러닝크루",
                "매주 함께 달려요",
                "상세 설명",
                "groups/running.png",
                schedule,
                null
        );

        // Then
        assertThat(modified.getName()).isEqualTo("새 러닝크루");
        assertThat(modified.getRecurringSchedule()).isEqualTo(schedule);
        assertThat(original.getName()).isEqualTo("러닝크루");
        assertThat(original.getRecurringSchedule()).isNull();
    }

    private RecurringGroupSchedule recurringSchedule() {
        return RecurringGroupSchedule.of(
                Set.of(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY),
                LocalTime.of(18, 0),
                LocalTime.of(20, 0)
        );
    }

    @DisplayName("동아리는 일회성 일정으로 수정할 수 없다.")
    @Test
    void clubCannotHaveSessionSchedule() {
        // Given
        Group group = Group.createClub("러닝크루", "함께 달려요", null, null, null, CREATED_AT);

        // When & Then
        assertThatThrownBy(() -> group.modify(
                "러닝크루",
                "함께 달려요",
                null,
                null,
                null,
                sessionSchedule()
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("생성 후 정확히 24시간까지는 삭제할 수 있고 종료할 수 없다.")
    @Test
    void deletionIncludesExactTwentyFourHourBoundary() {
        // Given
        Group group = Group.createClub("러닝크루", "함께 달려요", null, null, null, CREATED_AT);
        LocalDateTime boundary = CREATED_AT.plusHours(24);

        // When & Then
        assertThat(group.canDeleteAt(boundary)).isTrue();
        assertThat(group.canEndAt(boundary)).isFalse();
    }

    @DisplayName("생성 후 24시간이 지나면 삭제할 수 없고 종료할 수 있다.")
    @Test
    void groupCanEndAfterTwentyFourHours() {
        // Given
        Group original = Group.createClub("러닝크루", "함께 달려요", null, null, null, CREATED_AT);
        LocalDateTime afterBoundary = CREATED_AT.plusHours(24).plusNanos(1);

        // When
        Group ended = original.endAt(afterBoundary);

        // Then
        assertThat(original.getStatus()).isEqualTo(GroupStatus.ACTIVE);
        assertThat(ended.getStatus()).isEqualTo(GroupStatus.ENDED);
        assertThat(ended.getEndedOn()).isEqualTo(afterBoundary.toLocalDate());
        assertThat(ended.canDeleteAt(afterBoundary)).isFalse();
        assertThat(ended.canEndAt(afterBoundary)).isFalse();
    }

    @DisplayName("기본 일정의 달력 표시 설정은 그룹 정보와 일정 수정 후에도 유지된다.")
    @Test
    void calendarVisibilitySurvivesGroupChanges() {
        // Given
        Group original = Group.createClub("러닝크루", "함께 달려요", null, null, null, CREATED_AT);

        // When
        Group hidden = original.withBaseScheduleVisibility(false);
        Group renamed = hidden.modify("새 러닝크루", "함께 달려요", null, null, null, null);
        Group scheduled = renamed.replaceRecurringSchedule(recurringSchedule());

        // Then
        assertThat(original.isShowBaseScheduleInCalendar()).isTrue();
        assertThat(hidden.isShowBaseScheduleInCalendar()).isFalse();
        assertThat(renamed.isShowBaseScheduleInCalendar()).isFalse();
        assertThat(scheduled.isShowBaseScheduleInCalendar()).isFalse();
    }

    @DisplayName("종료한 그룹은 수정하거나 다시 종료할 수 없다.")
    @Test
    void endedGroupCannotChange() {
        // Given
        LocalDateTime now = CREATED_AT.plusHours(25);
        Group ended = Group.createClub("러닝크루", "함께 달려요", null, null, null, CREATED_AT)
                .endAt(now);

        // When & Then
        assertThatThrownBy(() -> ended.modify("새 이름", "새 소개", null, null, null, null))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
        assertThatThrownBy(() -> ended.endAt(now.plusHours(1)))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("새 모임은 전체 공개이고, 모임장이 확인된 소속으로만 소속 공개를 켤 수 있다.")
    @Test
    void leaderTurnsOnAffiliationOnlyWithOwnAffiliation() {
        // Given
        Group group = Group.createStudy("자바스터디", "자바를 공부해요", null, null, null, CREATED_AT);

        // When
        Group affiliationOnly = group.changeVisibility(GroupVisibility.AFFILIATION_ONLY, WOOTECO, VerifiedAffiliations.of(WOOTECO));

        // Then
        assertThat(group.getVisibility()).isEqualTo(GroupVisibility.PUBLIC);
        assertThat(group.getVisibleAffiliationId()).isNull();
        assertThat(affiliationOnly.getVisibility()).isEqualTo(GroupVisibility.AFFILIATION_ONLY);
        assertThat(affiliationOnly.getVisibleAffiliationId()).isEqualTo(WOOTECO);
        assertThatThrownBy(() -> group.changeVisibility(GroupVisibility.AFFILIATION_ONLY, WOOTECO, VerifiedAffiliations.none()))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_ACCESS_DENIED);
        assertThatThrownBy(() -> group.changeVisibility(GroupVisibility.AFFILIATION_ONLY, WOOTECO, VerifiedAffiliations.of(OTHER)))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_ACCESS_DENIED);
    }

    @DisplayName("소속 공개에는 공개할 소속이 필요하고, 다른 공개 범위에서는 소속을 비운다.")
    @Test
    void affiliationIsRequiredOnlyForAffiliationOnly() {
        // Given
        Group group = Group.createStudy("자바스터디", "자바를 공부해요", null, null, null, CREATED_AT);

        // When
        Group privateGroup = group.changeVisibility(GroupVisibility.PRIVATE, WOOTECO, VerifiedAffiliations.of(WOOTECO));

        // Then
        assertThat(privateGroup.getVisibility()).isEqualTo(GroupVisibility.PRIVATE);
        assertThat(privateGroup.getVisibleAffiliationId()).isNull();
        assertThatThrownBy(() -> group.changeVisibility(GroupVisibility.AFFILIATION_ONLY, null, VerifiedAffiliations.of(WOOTECO)))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("위임으로 모임장이 된 소속 밖 회원은 소속 공개를 끄거나 유지할 수만 있다.")
    @Test
    void outsideLeaderOnlyTurnsOffAffiliationOnly() {
        // Given
        Group affiliationOnly = Group.createStudy("자바스터디", "자바를 공부해요", null, null, null, CREATED_AT)
                .changeVisibility(GroupVisibility.AFFILIATION_ONLY, WOOTECO, VerifiedAffiliations.of(WOOTECO));

        // When
        Group kept = affiliationOnly.modify("새 이름", "새 소개", null, null, null, null)
                .changeVisibility(GroupVisibility.AFFILIATION_ONLY, WOOTECO, VerifiedAffiliations.of(OTHER));
        Group opened = affiliationOnly.changeVisibility(GroupVisibility.PUBLIC, null, VerifiedAffiliations.none());

        // Then
        assertThat(kept.getVisibility()).isEqualTo(GroupVisibility.AFFILIATION_ONLY);
        assertThat(kept.getVisibleAffiliationId()).isEqualTo(WOOTECO);
        assertThat(kept.getName()).isEqualTo("새 이름");
        assertThat(opened.getVisibility()).isEqualTo(GroupVisibility.PUBLIC);
        assertThat(opened.getVisibleAffiliationId()).isNull();
        assertThatThrownBy(() -> affiliationOnly.changeVisibility(GroupVisibility.AFFILIATION_ONLY, OTHER, VerifiedAffiliations.of(WOOTECO)))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_ACCESS_DENIED);
    }

    @DisplayName("상태 전이는 공개 범위와 공개할 소속을 유지한다.")
    @Test
    void transitionsKeepVisibility() {
        // Given
        Group affiliationOnly = Group.createClub("러닝크루", "함께 달려요", null, null, null, CREATED_AT)
                .changeVisibility(GroupVisibility.AFFILIATION_ONLY, WOOTECO, VerifiedAffiliations.of(WOOTECO));

        // When
        Group scheduled = affiliationOnly.replaceRecurringSchedule(recurringSchedule())
                .withBaseScheduleVisibility(false);
        Group ended = scheduled.endAt(CREATED_AT.plusHours(25));

        // Then
        assertThat(scheduled.getVisibility()).isEqualTo(GroupVisibility.AFFILIATION_ONLY);
        assertThat(scheduled.getVisibleAffiliationId()).isEqualTo(WOOTECO);
        assertThat(ended.getVisibility()).isEqualTo(GroupVisibility.AFFILIATION_ONLY);
        assertThat(ended.getVisibleAffiliationId()).isEqualTo(WOOTECO);
    }

    @DisplayName("소속 공개 모임은 그 소속의 회원과 현재 구성원에게만 보이고 그 소속만 초대로 받는다.")
    @Test
    void affiliationOnlyGroupIsVisibleToSameAffiliationAndCurrentMembers() {
        // Given
        Group open = Group.createStudy("자바스터디", "자바를 공부해요", null, null, null, CREATED_AT);
        Group affiliationOnly = open.changeVisibility(GroupVisibility.AFFILIATION_ONLY, WOOTECO, VerifiedAffiliations.of(WOOTECO));

        // When & Then
        assertThat(open.isVisibleTo(VerifiedAffiliations.none(), false)).isTrue();
        assertThat(open.allowsInvitationTo(VerifiedAffiliations.none())).isTrue();
        assertThat(affiliationOnly.isVisibleTo(VerifiedAffiliations.none(), false)).isFalse();
        assertThat(affiliationOnly.isVisibleTo(VerifiedAffiliations.of(OTHER), false)).isFalse();
        assertThat(affiliationOnly.isVisibleTo(VerifiedAffiliations.none(), true)).isTrue();
        assertThat(affiliationOnly.isVisibleTo(VerifiedAffiliations.of(OTHER, WOOTECO), false)).isTrue();
        assertThat(affiliationOnly.allowsInvitationTo(VerifiedAffiliations.of(OTHER))).isFalse();
        assertThat(affiliationOnly.allowsInvitationTo(VerifiedAffiliations.of(WOOTECO))).isTrue();
    }
}
