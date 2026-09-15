package com.project.jarihana.groupmember.query.service.dto;

import java.time.LocalDateTime;
import java.util.List;

public record GroupMemberListResult(
        List<Item> items,
        String nextCursor,
        boolean hasNext
) {

    public GroupMemberListResult {
        items = List.copyOf(items);
    }

    public record Item(
            Long groupMemberId,
            Long memberId,
            String crewName,
            Integer generation,
            String memberType,
            String avatarUrl,
            String course,
            String role,
            LocalDateTime joinedAt
    ) {

        public Item(
                Long groupMemberId,
                Long memberId,
                String crewName,
                Integer generation,
                String avatarUrl,
                String course,
                String role,
                LocalDateTime joinedAt
        ) {
            this(groupMemberId, memberId, crewName, generation, "CREW", avatarUrl, course, role, joinedAt);
        }
    }
}
