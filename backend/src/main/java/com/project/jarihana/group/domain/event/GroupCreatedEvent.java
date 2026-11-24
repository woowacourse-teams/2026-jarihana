package com.project.jarihana.group.domain.event;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupVisibility;
import java.time.LocalDateTime;

public record GroupCreatedEvent(long groupId, long creatorMemberId, LocalDateTime occurredAt, GroupVisibility visibility) {

    public GroupCreatedEvent(long groupId, long creatorMemberId, LocalDateTime occurredAt) {
        this(groupId, creatorMemberId, occurredAt, GroupVisibility.PUBLIC);
    }

    public static GroupCreatedEvent from(Group group, long creatorMemberId) {
        return new GroupCreatedEvent(group.getId(), creatorMemberId, group.getCreatedAt(), group.getVisibility());
    }

    public boolean crewOnly() {
        return visibility == GroupVisibility.CREW_ONLY;
    }
}
