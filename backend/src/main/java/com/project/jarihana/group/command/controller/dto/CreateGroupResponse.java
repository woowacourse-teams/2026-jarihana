package com.project.jarihana.group.command.controller.dto;

import com.project.jarihana.group.command.service.dto.CreateGroupResult;
import com.project.jarihana.group.domain.GroupStatus;

public record CreateGroupResponse(Long id, GroupStatus status) {

    public static CreateGroupResponse from(CreateGroupResult result) {
        return new CreateGroupResponse(result.id(), result.status());
    }
}
