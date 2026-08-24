package com.project.jarihana.group.command.controller.dto;

import com.project.jarihana.group.command.service.dto.TerminateGroupResult;
import com.project.jarihana.group.domain.GroupStatus;

import java.time.LocalDateTime;

public record TerminateGroupResponse(Long id, GroupStatus status, LocalDateTime updatedAt) {

    public static TerminateGroupResponse from(TerminateGroupResult result) {
        return new TerminateGroupResponse(result.id(), result.status(), result.updatedAt());
    }
}
