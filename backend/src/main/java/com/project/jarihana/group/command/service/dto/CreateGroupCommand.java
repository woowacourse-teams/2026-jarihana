package com.project.jarihana.group.command.service.dto;

import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.group.domain.MeetingType;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;

public record CreateGroupCommand(
        GroupType type,
        String name,
        String introduction,
        String description,
        MeetingType meetingType,
        String location,
        String representativeImageKey,
        RecurringSchedule recurringSchedule,
        SessionSchedule sessionSchedule
) {

    public record RecurringSchedule(
            Set<DayOfWeek> daysOfWeek,
            LocalTime startTime,
            LocalTime endTime
    ) {
    }

    public record SessionSchedule(
            LocalDate sessionDate,
            LocalTime startTime,
            LocalTime endTime
    ) {
    }
}
