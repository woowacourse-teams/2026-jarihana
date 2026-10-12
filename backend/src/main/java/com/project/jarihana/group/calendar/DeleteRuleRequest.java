package com.project.jarihana.group.calendar;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.time.LocalDate;

public record DeleteRuleRequest(@NotNull ScopedRuleRequest.ApplyScope applyScope, LocalDate fromDate,
                                @Positive Long periodId,
                                @NotNull Long version) {}
