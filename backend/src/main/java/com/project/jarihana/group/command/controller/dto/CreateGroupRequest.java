package com.project.jarihana.group.command.controller.dto;

import com.project.jarihana.group.command.service.dto.CreateGroupCommand;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.group.domain.MeetingType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;

public record CreateGroupRequest(
        @NotNull GroupType type,
        @NotBlank @Size(max = 50) String name,
        @NotBlank @Size(max = 100) String introduction,
        @Size(max = 5_000) String description,
        @NotNull MeetingType meetingType,
        @Size(max = 255) String location,
        @Valid RecurringScheduleRequest recurringSchedule,
        @Valid SessionScheduleRequest sessionSchedule
) {

    public CreateGroupCommand toCommand() {
        return new CreateGroupCommand(
                type,
                name,
                introduction,
                description,
                meetingType,
                location,
                recurringSchedule == null ? null : recurringSchedule.toCommand(),
                sessionSchedule == null ? null : sessionSchedule.toCommand()
        );
    }

    public record RecurringScheduleRequest(
            Set<DayOfWeek> daysOfWeek,
            LocalTime startTime,
            LocalTime endTime
    ) {

        private CreateGroupCommand.RecurringSchedule toCommand() {
            return new CreateGroupCommand.RecurringSchedule(daysOfWeek, startTime, endTime);
        }
    }

    public record SessionScheduleRequest(
            LocalDate sessionDate,
            LocalTime startTime,
            LocalTime endTime
    ) {

        private CreateGroupCommand.SessionSchedule toCommand() {
            return new CreateGroupCommand.SessionSchedule(sessionDate, startTime, endTime);
        }
    }
}
