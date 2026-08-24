package com.project.jarihana.group.command.service.dto;

import com.project.jarihana.group.domain.GroupStatus;

import java.time.LocalDateTime;

public record TerminateGroupResult(Long id, GroupStatus status, LocalDateTime updatedAt) {
}
