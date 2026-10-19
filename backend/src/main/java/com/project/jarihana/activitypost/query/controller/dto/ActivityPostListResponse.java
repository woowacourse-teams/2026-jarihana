package com.project.jarihana.activitypost.query.controller.dto;

import com.project.jarihana.activitypost.query.service.dto.ActivityPostListResult;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record ActivityPostListResponse(List<Item> items, String nextCursor, boolean hasNext) {

    public static ActivityPostListResponse from(ActivityPostListResult result) {
        return new ActivityPostListResponse(
                result.items().stream().map(Item::from).toList(),
                result.nextCursor(),
                result.hasNext()
        );
    }

    public record Item(
            Long id,
            Group group,
            String authorNickname,
            String imageUrl,
            String caption,
            LocalDate activityDate,
            LocalDateTime createdAt,
            boolean canModify,
            long commentCount,
            List<ActivityReactionResponse> reactions
    ) {

        private static Item from(ActivityPostListResult.Item item) {
            return new Item(
                    item.id(),
                    Group.from(item.group()),
                    item.authorNickname(),
                    item.imageUrl(),
                    item.caption(),
                    item.activityDate(),
                    item.createdAt(),
                    item.canModify(),
                    item.commentCount(),
                    item.reactions().stream().map(ActivityReactionResponse::from).toList()
            );
        }
    }

    public record Group(Long id, String name, String type, String status, boolean recruiting, boolean joined) {

        private static Group from(ActivityPostListResult.Group group) {
            return new Group(
                    group.id(),
                    group.name(),
                    group.type(),
                    group.status(),
                    group.recruiting(),
                    group.joined()
            );
        }
    }
}
