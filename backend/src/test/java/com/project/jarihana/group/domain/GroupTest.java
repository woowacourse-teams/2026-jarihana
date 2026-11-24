package com.project.jarihana.group.domain;

import com.project.jarihana.member.domain.MemberType;
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

    @DisplayName("새 모임은 전체 공개이고, 크루인 모임장만 크루 전용으로 켤 수 있다.")
    @Test
    void onlyCrewLeaderTurnsOnCrewOnly() {
        // Given
        Group group = Group.createStudy("자바스터디", "자바를 공부해요", null, null, null, CREATED_AT);

        // When
        Group crewOnly = group.changeVisibility(GroupVisibility.CREW_ONLY, MemberType.CREW);

        // Then
        assertThat(group.getVisibility()).isEqualTo(GroupVisibility.PUBLIC);
        assertThat(crewOnly.getVisibility()).isEqualTo(GroupVisibility.CREW_ONLY);
        assertThatThrownBy(() -> group.changeVisibility(GroupVisibility.CREW_ONLY, MemberType.MEMBER))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_ACCESS_DENIED);
        assertThatThrownBy(() -> group.changeVisibility(GroupVisibility.CREW_ONLY, MemberType.COACH))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_ACCESS_DENIED);
    }

    @DisplayName("위임으로 모임장이 된 비크루는 크루 전용을 끌 수만 있다.")
    @Test
    void nonCrewLeaderOnlyTurnsOffCrewOnly() {
        // Given
        Group crewOnly = Group.createStudy("자바스터디", "자바를 공부해요", null, null, null, CREATED_AT)
                .changeVisibility(GroupVisibility.CREW_ONLY, MemberType.CREW);

        // When
        Group opened = crewOnly.changeVisibility(GroupVisibility.PUBLIC, MemberType.MEMBER);

        // Then
        assertThat(opened.getVisibility()).isEqualTo(GroupVisibility.PUBLIC);
        assertThatThrownBy(() -> opened.changeVisibility(GroupVisibility.CREW_ONLY, MemberType.MEMBER))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_ACCESS_DENIED);
    }

    @DisplayName("공개 범위를 그대로 두는 수정은 모임장 유형과 관계없이 허용한다.")
    @Test
    void keepingVisibilityNeedsNoCrewLeader() {
        // Given
        Group crewOnly = Group.createStudy("자바스터디", "자바를 공부해요", null, null, null, CREATED_AT)
                .changeVisibility(GroupVisibility.CREW_ONLY, MemberType.CREW);

        // When
        Group kept = crewOnly.modify("새 이름", "새 소개", null, null, null, null)
                .changeVisibility(GroupVisibility.CREW_ONLY, MemberType.MEMBER);

        // Then
        assertThat(kept.getVisibility()).isEqualTo(GroupVisibility.CREW_ONLY);
        assertThat(kept.getName()).isEqualTo("새 이름");
    }

    @DisplayName("상태 전이는 공개 범위를 유지한다.")
    @Test
    void transitionsKeepVisibility() {
        // Given
        Group crewOnly = Group.createClub("러닝크루", "함께 달려요", null, null, null, CREATED_AT)
                .changeVisibility(GroupVisibility.CREW_ONLY, MemberType.CREW);

        // When
        Group scheduled = crewOnly.replaceRecurringSchedule(recurringSchedule())
                .withBaseScheduleVisibility(false);
        Group ended = scheduled.endAt(CREATED_AT.plusHours(25));

        // Then
        assertThat(scheduled.getVisibility()).isEqualTo(GroupVisibility.CREW_ONLY);
        assertThat(ended.getVisibility()).isEqualTo(GroupVisibility.CREW_ONLY);
    }

    @DisplayName("크루 전용 모임은 크루와 현재 구성원에게만 보이고 크루만 새로 받는다.")
    @Test
    void crewOnlyGroupIsVisibleToCrewAndCurrentMembers() {
        // Given
        Group open = Group.createStudy("자바스터디", "자바를 공부해요", null, null, null, CREATED_AT);
        Group crewOnly = open.changeVisibility(GroupVisibility.CREW_ONLY, MemberType.CREW);

        // When & Then
        assertThat(open.isVisibleTo(null, false)).isTrue();
        assertThat(open.admits(MemberType.MEMBER)).isTrue();
        assertThat(crewOnly.isVisibleTo(null, false)).isFalse();
        assertThat(crewOnly.isVisibleTo(MemberType.MEMBER, false)).isFalse();
        assertThat(crewOnly.isVisibleTo(MemberType.COACH, false)).isFalse();
        assertThat(crewOnly.isVisibleTo(MemberType.MEMBER, true)).isTrue();
        assertThat(crewOnly.isVisibleTo(MemberType.CREW, false)).isTrue();
        assertThat(crewOnly.admits(MemberType.MEMBER)).isFalse();
        assertThat(crewOnly.admits(MemberType.CREW)).isTrue();
    }
}
