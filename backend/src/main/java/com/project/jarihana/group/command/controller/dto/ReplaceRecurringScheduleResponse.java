package com.project.jarihana.group.command.controller.dto;

import com.project.jarihana.group.command.service.dto.ReplaceRecurringScheduleResult;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;

public record ReplaceRecurringScheduleResponse(
        Set<DayOfWeek> daysOfWeek,
        LocalTime startTime,
        LocalTime endTime
) {

    public static ReplaceRecurringScheduleResponse from(ReplaceRecurringScheduleResult result) {
        return new ReplaceRecurringScheduleResponse(result.daysOfWeek(), result.startTime(), result.endTime());
    }
}
