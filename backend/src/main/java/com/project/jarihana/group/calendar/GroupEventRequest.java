package com.project.jarihana.group.calendar;

import com.project.jarihana.group.domain.GroupEventType;
import com.project.jarihana.group.domain.GroupEventStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalTime;

public record GroupEventRequest(
        @NotBlank @Size(max = 50) String title,
        @NotNull LocalDate startDate,
        @NotNull LocalDate endDate,
        @NotNull Boolean allDay,
        LocalTime startTime,
        LocalTime endTime,
        @NotBlank @Size(max = 10_000) String description,
        @Size(max = 255) String location,
        Long version,
        GroupEventType eventType,
        GroupEventStatus status
    ) {
    public GroupEventType resolvedEventType() {
        return eventType == null ? GroupEventType.INDIVIDUAL : eventType;
    }

    public GroupEventStatus resolvedStatus() {
        return status == null ? GroupEventStatus.AUTO : status;
    }
}
