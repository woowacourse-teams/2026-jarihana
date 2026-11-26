package com.project.jarihana.group.command.service.dto;

import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.group.domain.GroupVisibility;
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
        SessionSchedule sessionSchedule,
        String clubhouseTemplateKey,
        GroupVisibility visibility,
        Long visibleAffiliationId
) {

    public CreateGroupCommand(GroupType type, String name, String introduction, String description,
                              MeetingType meetingType, String location, String representativeImageKey,
                              RecurringSchedule recurringSchedule, SessionSchedule sessionSchedule,
                              String clubhouseTemplateKey) {
        this(type, name, introduction, description, meetingType, location, representativeImageKey,
                recurringSchedule, sessionSchedule, clubhouseTemplateKey, null, null);
    }

    public CreateGroupCommand(GroupType type, String name, String introduction, String description,
                              MeetingType meetingType, String location, String representativeImageKey,
                              RecurringSchedule recurringSchedule, SessionSchedule sessionSchedule) {
        this(type, name, introduction, description, meetingType, location, representativeImageKey,
                recurringSchedule, sessionSchedule, null, null, null);
    }

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
