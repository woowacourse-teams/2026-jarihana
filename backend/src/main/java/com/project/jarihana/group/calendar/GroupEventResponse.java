package com.project.jarihana.group.calendar;

import com.project.jarihana.group.domain.GroupEvent;
import com.project.jarihana.group.domain.GroupEventStatus;
import com.project.jarihana.group.domain.GroupEventType;

import java.time.LocalDate;
import java.time.LocalTime;

public record GroupEventResponse(
        Long id,
        GroupEventType eventType,
        GroupEventStatus status,
        GroupEventStatus effectiveStatus,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        boolean allDay,
        LocalTime startTime,
        LocalTime endTime,
        String description,
        String location,
        Long version
) {
    public static GroupEventResponse from(GroupEvent event, LocalDate today) {
        return new GroupEventResponse(event.getId(), event.getEventType(), event.getStatus(),
                event.getEffectiveStatus(today), event.getTitle(), event.getStartDate(), event.getEndDate(),
                event.isAllDay(), event.getStartTime(), event.getEndTime(), event.getDescription(),
                event.getLocation(), event.getVersion());
    }
}
