package com.project.jarihana.group.calendar;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.time.LocalDate;

public record RecurringOccurrenceDeleteRequest(
        @NotNull LocalDate sourceDate,
        @Positive long periodId,
        @NotNull @PositiveOrZero Long seriesVersion
) {}
