package com.project.jarihana.group.command.controller.dto;

import com.project.jarihana.group.command.service.dto.ReplaceSessionScheduleResult;

import java.time.LocalDate;
import java.time.LocalTime;

public record ReplaceSessionScheduleResponse(
        LocalDate sessionDate,
        LocalTime startTime,
        LocalTime endTime
) {

    public static ReplaceSessionScheduleResponse from(ReplaceSessionScheduleResult result) {
        return new ReplaceSessionScheduleResponse(result.sessionDate(), result.startTime(), result.endTime());
    }
}
