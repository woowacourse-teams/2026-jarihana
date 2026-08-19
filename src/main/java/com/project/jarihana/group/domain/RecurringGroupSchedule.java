package com.project.jarihana.group.domain;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;

public final class RecurringGroupSchedule {

    private final Set<DayOfWeek> daysOfWeek;
    private final LocalTime startTime;
    private final LocalTime endTime;

    private RecurringGroupSchedule(Set<DayOfWeek> daysOfWeek, LocalTime startTime, LocalTime endTime) {
        this.daysOfWeek = validateDaysOfWeek(daysOfWeek);
        this.startTime = validateTime(startTime, "시작 시각");
        this.endTime = validateTime(endTime, "종료 시각");
        validateTimeRange(this.startTime, this.endTime);
    }

    public static RecurringGroupSchedule of(
            Set<DayOfWeek> daysOfWeek,
            LocalTime startTime,
            LocalTime endTime
    ) {
        return new RecurringGroupSchedule(daysOfWeek, startTime, endTime);
    }

    private static Set<DayOfWeek> validateDaysOfWeek(Set<DayOfWeek> daysOfWeek) {
        if (daysOfWeek == null || daysOfWeek.isEmpty()) {
            throw new IllegalArgumentException("활동 요일은 하나 이상이어야 합니다.");
        }
        if (daysOfWeek.stream().anyMatch(dayOfWeek -> dayOfWeek == null)) {
            throw new IllegalArgumentException("활동 요일에는 null이 포함될 수 없습니다.");
        }
        return Set.copyOf(daysOfWeek);
    }

    private static LocalTime validateTime(LocalTime time, String fieldName) {
        if (time == null) {
            throw new IllegalArgumentException(fieldName + "은 필수입니다.");
        }
        return time;
    }

    private static void validateTimeRange(LocalTime startTime, LocalTime endTime) {
        if (!startTime.isBefore(endTime)) {
            throw new IllegalArgumentException("시작 시각은 종료 시각보다 빨라야 합니다.");
        }
    }

    public Set<DayOfWeek> getDaysOfWeek() {
        return daysOfWeek;
    }

    public LocalTime getStartTime() {
        return startTime;
    }

    public LocalTime getEndTime() {
        return endTime;
    }
}
