package com.project.jarihana.group.command.controller.dto;

import com.project.jarihana.group.command.service.dto.ReplaceRecurringScheduleCommand;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;

public record ReplaceRecurringScheduleRequest(
        Set<DayOfWeek> daysOfWeek,
        LocalTime startTime,
        LocalTime endTime
) {

    public ReplaceRecurringScheduleCommand toCommand() {
        return new ReplaceRecurringScheduleCommand(daysOfWeek, startTime, endTime);
    }
}
