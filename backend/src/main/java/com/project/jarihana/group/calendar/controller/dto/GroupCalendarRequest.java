package com.project.jarihana.group.calendar.controller.dto;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public record GroupCalendarRequest(
        @NotNull LocalDate from,
        @NotNull LocalDate to
) {
}
