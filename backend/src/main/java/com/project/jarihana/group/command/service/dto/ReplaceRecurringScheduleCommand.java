package com.project.jarihana.group.command.service.dto;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;

public record ReplaceRecurringScheduleCommand(
        Set<DayOfWeek> daysOfWeek,
        LocalTime startTime,
        LocalTime endTime
) {
}
