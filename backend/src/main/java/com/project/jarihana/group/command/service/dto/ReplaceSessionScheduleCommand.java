package com.project.jarihana.group.command.service.dto;

import java.time.LocalDate;
import java.time.LocalTime;

public record ReplaceSessionScheduleCommand(
        LocalDate sessionDate,
        LocalTime startTime,
        LocalTime endTime
) {
}
