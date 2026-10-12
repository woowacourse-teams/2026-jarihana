package com.project.jarihana.group.calendar;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;

public record ScopedRuleRequest(
        @NotEmpty Set<DayOfWeek> daysOfWeek,
        LocalTime startTime,
        LocalTime endTime,
        @NotNull ApplyScope applyScope,
        LocalDate fromDate,
        @Positive Long periodId,
        @NotNull Long version
) {
    public enum ApplyScope { ALL, FROM_TODAY }
}
