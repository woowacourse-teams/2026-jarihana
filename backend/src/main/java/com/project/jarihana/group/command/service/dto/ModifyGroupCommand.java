package com.project.jarihana.group.command.service.dto;

import com.project.jarihana.group.domain.MeetingType;

public record ModifyGroupCommand(
        String name,
        String introduction,
        String description,
        MeetingType meetingType,
        String location
) {

    public ModifyGroupCommand(String name, String introduction, String description) {
        this(name, introduction, description, MeetingType.FLEXIBLE, null);
    }
}
