package com.project.jarihana.groupmember.query.controller.dto;

import com.project.jarihana.groupmember.query.service.dto.GroupMemberListResult;

import java.time.LocalDateTime;
import java.util.List;

public record GroupMemberListResponse(
        List<GroupMemberItem> items,
        String nextCursor,
        boolean hasNext
) {

    public GroupMemberListResponse {
        items = List.copyOf(items);
    }

    public static GroupMemberListResponse from(GroupMemberListResult result) {
        return new GroupMemberListResponse(
                result.items().stream().map(GroupMemberItem::from).toList(),
                result.nextCursor(),
                result.hasNext()
        );
    }

    public record GroupMemberItem(
            Long groupMemberId,
            Long memberId,
            String crewName,
            Integer generation,
            String avatarUrl,
            String course,
            String role,
            LocalDateTime joinedAt
    ) {

        private static GroupMemberItem from(GroupMemberListResult.Item item) {
            return new GroupMemberItem(
                    item.groupMemberId(),
                    item.memberId(),
                    item.crewName(),
                    item.generation(),
                    item.avatarUrl(),
                    item.course(),
                    item.role(),
                    item.joinedAt()
            );
        }
    }
}
