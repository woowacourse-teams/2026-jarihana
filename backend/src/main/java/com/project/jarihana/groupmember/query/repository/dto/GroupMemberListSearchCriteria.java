package com.project.jarihana.groupmember.query.repository.dto;

import java.time.LocalDateTime;

public record GroupMemberListSearchCriteria(
        Long groupId,
        LocalDateTime cursorJoinedAt,
        Long cursorId
) {
}
