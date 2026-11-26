package com.project.jarihana.group.domain.event;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupVisibility;
import java.time.LocalDateTime;

/**
 * @param visibleAffiliationId 소속 공개 모임이 정한 소속. 다른 공개 범위에서는 {@code null}이다.
 */
public record GroupCreatedEvent(
        long groupId,
        long creatorMemberId,
        LocalDateTime occurredAt,
        GroupVisibility visibility,
        Long visibleAffiliationId
) {

    public GroupCreatedEvent(long groupId, long creatorMemberId, LocalDateTime occurredAt) {
        this(groupId, creatorMemberId, occurredAt, GroupVisibility.PUBLIC, null);
    }

    public static GroupCreatedEvent from(Group group, long creatorMemberId) {
        return new GroupCreatedEvent(group.getId(), creatorMemberId, group.getCreatedAt(), group.getVisibility(),
                group.getVisibleAffiliationId());
    }
}
