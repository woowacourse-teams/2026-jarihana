package com.project.jarihana.group.domain.event;

import com.project.jarihana.group.domain.Group;
import java.time.LocalDateTime;

public record GroupCreatedEvent(long groupId, long creatorMemberId, LocalDateTime occurredAt) {
    public static GroupCreatedEvent from(Group group, long creatorMemberId) {
        return new GroupCreatedEvent(group.getId(), creatorMemberId, group.getCreatedAt());
    }
}
