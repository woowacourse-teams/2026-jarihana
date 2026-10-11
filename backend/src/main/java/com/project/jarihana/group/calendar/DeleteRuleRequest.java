package com.project.jarihana.group.calendar;

import jakarta.validation.constraints.NotNull;

public record DeleteRuleRequest(@NotNull ScopedRuleRequest.ApplyScope applyScope, @NotNull Long version) {}
