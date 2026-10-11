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
                GROUP, "가을 모임", LocalDate.of(2026, 10, 7), LocalDate.of(2026, 10, 8),
                true, null, null, "함께 만나요", null, NOW
        );

        // Then
        assertThat(event.isAllDay()).isTrue();
        assertThat(event.getEndDate()).isEqualTo(LocalDate.of(2026, 10, 8));
        assertThat(event.getStartTime()).isNull();
    }

    @DisplayName("시간 지정 일정은 시작 일시가 종료 일시보다 빨라야 한다.")
    @Test
    void rejectsInvalidTimedRange() {
        // When & Then
        assertThatThrownBy(() -> GroupEvent.create(
                GROUP, "저녁 모임", LocalDate.of(2026, 10, 7), LocalDate.of(2026, 10, 7),
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
                GROUP, "모임", LocalDate.of(2026, 10, 7), LocalDate.of(2026, 10, 7),
                true, null, null, " ", null, NOW
        )).isInstanceOf(BusinessException.class);
    }

    @DisplayName("일정을 삭제해도 기존 값은 그대로 두고 새 상태를 만든다.")
    @Test
    void deletesImmutably() {
        // Given
        GroupEvent original = GroupEvent.create(
                GROUP, "모임", LocalDate.of(2026, 10, 7), LocalDate.of(2026, 10, 7),
                true, null, null, "설명", null, NOW
        );

        // When
        GroupEvent deleted = original.deleteAt(NOW.plusDays(1));

        // Then
        assertThat(original.getDeletedAt()).isNull();
        assertThat(deleted.getDeletedAt()).isEqualTo(NOW.plusDays(1));
    }
}
