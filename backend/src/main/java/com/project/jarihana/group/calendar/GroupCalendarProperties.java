package com.project.jarihana.group.calendar;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jarihana.group-calendar")
public record GroupCalendarProperties(boolean legacyRecurringWriteEnabled) {}
