package com.project.jarihana.group.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GroupEventTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 7, 12, 0);
    private static final Group GROUP = Group.createClub("보드게임 모임", "함께 놀아요", null, null, null, NOW);

    @DisplayName("종일 일정은 종료일을 포함하고 시각을 갖지 않는다.")
    @Test
    void createsAllDayEvent() {
        // When
        GroupEvent event = GroupEvent.create(
                GROUP, GroupEventType.INDIVIDUAL, "가을 모임", LocalDate.of(2026, 10, 7), LocalDate.of(2026, 10, 8),
                true, null, null, "함께 만나요", null, NOW
        );

        // Then
        assertThat(event.isAllDay()).isTrue();
        assertThat(event.getEventType()).isEqualTo(GroupEventType.INDIVIDUAL);
        assertThat(event.getEndDate()).isEqualTo(LocalDate.of(2026, 10, 8));
        assertThat(event.getStartTime()).isNull();
    }

    @DisplayName("시간 지정 일정은 시작 일시가 종료 일시보다 빨라야 한다.")
    @Test
    void rejectsInvalidTimedRange() {
        // When & Then
        assertThatThrownBy(() -> GroupEvent.create(
                GROUP, GroupEventType.INDIVIDUAL, "저녁 모임", LocalDate.of(2026, 10, 7), LocalDate.of(2026, 10, 7),
                false, LocalTime.of(20, 0), LocalTime.of(19, 0), "설명", null, NOW
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("개별 일정 설명은 필수이고 장소는 비워 둘 수 있다.")
    @Test
    void requiresDescriptionButNotLocation() {
        // When & Then
        assertThatThrownBy(() -> GroupEvent.create(
                GROUP, GroupEventType.INDIVIDUAL, "모임", LocalDate.of(2026, 10, 7), LocalDate.of(2026, 10, 7),
                true, null, null, " ", null, NOW
        )).isInstanceOf(BusinessException.class);
    }

    @DisplayName("일정을 삭제해도 기존 값은 그대로 두고 새 상태를 만든다.")
    @Test
    void deletesImmutably() {
        // Given
        GroupEvent original = GroupEvent.create(
                GROUP, GroupEventType.INDIVIDUAL, "모임", LocalDate.of(2026, 10, 7), LocalDate.of(2026, 10, 7),
                true, null, null, "설명", null, NOW
        );

        // When
        GroupEvent deleted = original.deleteAt(NOW.plusDays(1));

        // Then
        assertThat(original.getDeletedAt()).isNull();
        assertThat(deleted.getDeletedAt()).isEqualTo(NOW.plusDays(1));
    }

    @DisplayName("일회성 정기 모임은 제목을 고정하고 하루 일정만 허용한다.")
    @Test
    void createsSingleDateRegularMeeting() {
        // When
        GroupEvent event = GroupEvent.create(
                GROUP, GroupEventType.REGULAR_MEETING, "사용자 입력 제목",
                LocalDate.of(2026, 10, 7), LocalDate.of(2026, 10, 7),
                false, LocalTime.of(19, 0), LocalTime.of(21, 0), "오늘 모여요", "회의실", NOW
        );

        // Then
        assertThat(event.getEventType()).isEqualTo(GroupEventType.REGULAR_MEETING);
        assertThat(event.getTitle()).isEqualTo("정기 모임");
        assertThat(event.getStartDate()).isEqualTo(event.getEndDate());
        assertThat(event.getStatus()).isEqualTo(GroupEventStatus.AUTO);
    }

    @DisplayName("자동 상태는 날짜가 지나면 개최 완료로 바뀌고 수동 상태는 유지된다.")
    @Test
    void resolvesStatusFromDateUnlessManuallyOverridden() {
        LocalDate eventDate = LocalDate.of(2026, 10, 7);
        GroupEvent automatic = GroupEvent.create(GROUP, GroupEventType.REGULAR_MEETING,
                GroupEventStatus.AUTO, "정기 모임", eventDate, eventDate,
                true, null, null, "설명", null, NOW);
        GroupEvent manuallyUpcoming = GroupEvent.create(GROUP, GroupEventType.REGULAR_MEETING,
                GroupEventStatus.UPCOMING, "정기 모임", eventDate, eventDate,
                true, null, null, "설명", null, NOW);

        assertThat(automatic.getEffectiveStatus(eventDate.minusDays(1))).isEqualTo(GroupEventStatus.UPCOMING);
        assertThat(automatic.getEffectiveStatus(eventDate)).isEqualTo(GroupEventStatus.UPCOMING);
        assertThat(automatic.getEffectiveStatus(eventDate.plusDays(1))).isEqualTo(GroupEventStatus.COMPLETED);
        assertThat(manuallyUpcoming.getEffectiveStatus(eventDate.plusDays(1))).isEqualTo(GroupEventStatus.UPCOMING);
    }

    @DisplayName("일회성 정기 모임은 같이해요에 등록할 수 없다.")
    @Test
    void rejectsRegularMeetingForSessionGroup() {
        // Given
        Group session = Group.createSession("같이해요", "게임을 함께 해요", null, null,
                SessionGroupSchedule.of(LocalDate.of(2026, 10, 7), LocalTime.of(19, 0), LocalTime.of(21, 0)), NOW);

        // When & Then
        assertThatThrownBy(() -> GroupEvent.create(
                session, GroupEventType.REGULAR_MEETING, "정기 모임",
                LocalDate.of(2026, 10, 7), LocalDate.of(2026, 10, 7),
                true, null, null, "설명", null, NOW
        )).isInstanceOf(BusinessException.class);
    }

    @DisplayName("일회성 정기 모임은 여러 날에 걸칠 수 없다.")
    @Test
    void rejectsMultiDayRegularMeeting() {
        // When & Then
        assertThatThrownBy(() -> GroupEvent.create(
                GROUP, GroupEventType.REGULAR_MEETING, "정기 모임",
                LocalDate.of(2026, 10, 7), LocalDate.of(2026, 10, 8),
                true, null, null, "설명", null, NOW
        )).isInstanceOf(BusinessException.class);
    }
}
