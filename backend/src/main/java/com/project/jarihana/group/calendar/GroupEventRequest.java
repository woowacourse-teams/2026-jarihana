package com.project.jarihana.group.calendar;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalTime;

public record GroupEventRequest(
        @NotBlank @Size(max = 50) String title,
        @NotNull LocalDate startDate,
        @NotNull LocalDate endDate,
        @NotNull Boolean allDay,
        LocalTime startTime,
        LocalTime endTime,
        @NotBlank @Size(max = 10_000) String description,
        @Size(max = 255) String location,
        Long version
) {
}
