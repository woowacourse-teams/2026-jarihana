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
        this.startTime = validateTime(startTime, "시작 시각");
        this.endTime = validateTime(endTime, "종료 시각");
        validateTimeRange(this.startTime, this.endTime);
    }

    private static LocalTime validateTime(LocalTime time, String fieldName) {
        if (time == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, fieldName + "은 필수입니다.");
        }
        return time;
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
