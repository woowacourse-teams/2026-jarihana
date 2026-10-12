package com.project.jarihana.group.calendar;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;

public record RuleEditRequest(
        @NotEmpty Set<DayOfWeek> daysOfWeek,
        LocalTime startTime,
        LocalTime endTime,
        @NotNull Long version
) {}
