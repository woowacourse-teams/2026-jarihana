package com.project.jarihana.groupspace.query.repository;

import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import java.time.LocalDateTime;

public record GroupSpaceProjection(String roomJson, Long revision, LocalDateTime updatedAt,
                                   GroupType type, GroupStatus status, GroupMemberRole role) {}
