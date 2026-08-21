package com.project.jarihana.group.command.controller.dto;

import com.project.jarihana.group.command.service.dto.ReplaceSessionScheduleCommand;
import java.time.LocalDate;
import java.time.LocalTime;

public record ReplaceSessionScheduleRequest(
        LocalDate sessionDate,
        LocalTime startTime,
        LocalTime endTime
) {

    public ReplaceSessionScheduleCommand toCommand() {
        return new ReplaceSessionScheduleCommand(sessionDate, startTime, endTime);
    }
}
