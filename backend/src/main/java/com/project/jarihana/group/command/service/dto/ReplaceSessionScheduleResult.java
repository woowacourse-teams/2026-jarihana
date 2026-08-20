package com.project.jarihana.group.command.service.dto;

import java.time.LocalDate;
import java.time.LocalTime;

public record ReplaceSessionScheduleResult(
        LocalDate sessionDate,
        LocalTime startTime,
        LocalTime endTime
) {
}
