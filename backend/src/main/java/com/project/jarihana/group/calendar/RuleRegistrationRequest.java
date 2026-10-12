package com.project.jarihana.group.calendar;

import jakarta.validation.constraints.NotEmpty;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;

public record RuleRegistrationRequest(
        @NotEmpty Set<DayOfWeek> daysOfWeek,
        LocalTime startTime,
        LocalTime endTime
) {}
