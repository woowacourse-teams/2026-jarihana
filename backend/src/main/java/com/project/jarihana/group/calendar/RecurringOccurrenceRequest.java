package com.project.jarihana.group.calendar;

import com.project.jarihana.group.domain.GroupEventStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.time.LocalDate;
import java.time.LocalTime;

public record RecurringOccurrenceRequest(
        @NotNull LocalDate sourceDate,
        @Positive long periodId,
        @NotNull @jakarta.validation.constraints.PositiveOrZero Long seriesVersion,
        @NotNull LocalDate startDate,
        @NotNull Boolean allDay,
        LocalTime startTime,
        LocalTime endTime,
        GroupEventStatus status,
        @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 10_000) String description,
        @jakarta.validation.constraints.Size(max = 255) String location
) {
    public GroupEventStatus resolvedStatus() {
        return status == null ? GroupEventStatus.AUTO : status;
    }
}
