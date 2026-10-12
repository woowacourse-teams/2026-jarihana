package com.project.jarihana.group.calendar.controller.dto;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public record ScheduleDetailRequest(
        @NotNull Kind kind,
        @NotNull LocalDate date
) {
    public enum Kind { RECURRING, SESSION }
}
