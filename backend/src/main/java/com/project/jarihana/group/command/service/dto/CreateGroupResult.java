package com.project.jarihana.group.command.service.dto;

import com.project.jarihana.group.domain.GroupStatus;

public record CreateGroupResult(Long id, GroupStatus status) {
}
