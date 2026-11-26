package com.project.jarihana.group.command.service.dto;

import com.project.jarihana.group.domain.GroupVisibility;
import com.project.jarihana.group.domain.MeetingType;

public record ModifyGroupCommand(
        String name,
        String introduction,
        String description,
        MeetingType meetingType,
        String location,
        String representativeImageKey,
        GroupVisibility visibility,
        Long visibleAffiliationId
) {

    public ModifyGroupCommand(String name, String introduction, String description, MeetingType meetingType,
                              String location, String representativeImageKey) {
        this(name, introduction, description, meetingType, location, representativeImageKey, null, null);
    }
}
