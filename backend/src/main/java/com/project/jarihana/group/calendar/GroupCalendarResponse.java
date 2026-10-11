package com.project.jarihana.group.calendar;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record GroupCalendarResponse(
        boolean showBaseSchedule,
        FlexibleBeforeFirstRecurring flexibleBeforeFirstRecurring,
        List<FlexibleAfterRecurring> flexibleAfterRecurring,
        List<CalendarEvent> events
) {
    public record FlexibleBeforeFirstRecurring(LocalDate fromDate, LocalDate untilDate, LocalDate registeredOn) {}
    public record FlexibleAfterRecurring(LocalDate fromDate, LocalDate untilDate) {}

    public record CalendarEvent(
            String kind,
            Long id,
            String occurrenceKey,
            Long periodId,
            String title,
            LocalDate startDate,
            LocalDate endDate,
            boolean allDay,
            LocalTime startTime,
            LocalTime endTime
    ) {}
}
