package com.project.jarihana.group.calendar;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public record CalendarRangeRequest(@NotNull LocalDate startDate, LocalDate endDate, @NotNull Long version) {}
