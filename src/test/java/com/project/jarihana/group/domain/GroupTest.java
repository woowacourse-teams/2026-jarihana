package com.project.jarihana.group.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

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
        assertThat(club.getRecurringSchedule()).isNull();
        assertThat(study.getRecurringSchedule()).isNull();
        assertThat(club.getStatus()).isEqualTo(GroupStatus.ACTIVE);
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
        )).isInstanceOf(IllegalArgumentException.class);
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

    @DisplayName("그룹 이름과 소개의 길이를 검증한다.")
    @Test
    void validateNameAndIntroductionLength() {
        // When & Then
        assertThatThrownBy(() -> Group.createClub("", "소개", null, null, null, CREATED_AT))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Group.createClub("이름", " ", null, null, null, CREATED_AT))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Group.createClub("가".repeat(51), "소개", null, null, null, CREATED_AT))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Group.createClub("이름", "가".repeat(101), null, null, null, CREATED_AT))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Group.createClub("이름", "소개", "가".repeat(5001), null, null, CREATED_AT))
                .isInstanceOf(IllegalArgumentException.class);
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
        )).isInstanceOf(IllegalArgumentException.class);
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
        assertThat(ended.canDeleteAt(afterBoundary)).isFalse();
        assertThat(ended.canEndAt(afterBoundary)).isFalse();
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
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> ended.endAt(now.plusHours(1)))
                .isInstanceOf(IllegalStateException.class);
    }

    private RecurringGroupSchedule recurringSchedule() {
        return RecurringGroupSchedule.of(
                Set.of(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY),
                LocalTime.of(18, 0),
                LocalTime.of(20, 0)
        );
    }

    private SessionGroupSchedule sessionSchedule() {
        return SessionGroupSchedule.of(
                LocalDate.of(2026, 8, 30),
                LocalTime.of(14, 0),
                LocalTime.of(16, 0)
        );
    }
}
