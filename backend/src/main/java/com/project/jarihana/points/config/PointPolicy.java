package com.project.jarihana.points.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.temporal.TemporalAdjusters;

@Component
public class PointPolicy {
    public static final int VERSION = 1;

    private final LocalDateTime startsAt;

    public PointPolicy(@Value("${jarihana.points.starts-at:}") String configuredStart) {
        startsAt = configuredStart.isBlank() ? null : LocalDateTime.parse(configuredStart);
    }

    public boolean isActiveAt(LocalDateTime time) {
        return startsAt != null && !time.isBefore(startsAt);
    }

    public static LocalDateTime weekStart(LocalDateTime time) {
        return time.toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).atStartOfDay();
    }
}
