package com.project.jarihana.group.calendar;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;

public record ScopedRuleRequest(
        @NotEmpty Set<DayOfWeek> daysOfWeek,
        LocalTime startTime,
        LocalTime endTime,
        @NotNull ApplyScope applyScope,
        @NotNull Long version
) {
    public enum ApplyScope { ALL, PREVIOUS_RULE, FROM_TODAY }
}
