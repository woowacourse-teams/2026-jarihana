package com.project.jarihana.group.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Embeddable;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;

@Embeddable
public class RecurringGroupSchedule {

    @Convert(converter = ActivityDaysConverter.class)
    @Column(name = "activity_days")
    private ActivityDays activityDays;

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    protected RecurringGroupSchedule() {
    }

    private RecurringGroupSchedule(Set<DayOfWeek> daysOfWeek, LocalTime startTime, LocalTime endTime) {
        this.activityDays = ActivityDays.from(daysOfWeek);
        validateTimes(startTime, endTime);
        this.startTime = startTime;
        this.endTime = endTime;
    }

    /* 두 시각을 함께 비우면 요일만 고정하고 시간은 그때그때 정하는 유동적 시간이다. */
    private static void validateTimes(LocalTime startTime, LocalTime endTime) {
        if (startTime == null && endTime == null) {
            return;
        }
        if (startTime == null || endTime == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "시작 시각과 종료 시각은 함께 정하거나 함께 비워야 합니다.");
        }
        validateTimeRange(startTime, endTime);
    }

    private static void validateTimeRange(LocalTime startTime, LocalTime endTime) {
        if (!startTime.isBefore(endTime)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "시작 시각은 종료 시각보다 빨라야 합니다.");
        }
    }

    public static RecurringGroupSchedule of(
            Set<DayOfWeek> daysOfWeek,
            LocalTime startTime,
            LocalTime endTime
    ) {
        return new RecurringGroupSchedule(daysOfWeek, startTime, endTime);
    }

    public ActivityDays getActivityDays() {
        return activityDays;
    }

    public LocalTime getStartTime() {
        return startTime;
    }

    public LocalTime getEndTime() {
        return endTime;
    }
}
