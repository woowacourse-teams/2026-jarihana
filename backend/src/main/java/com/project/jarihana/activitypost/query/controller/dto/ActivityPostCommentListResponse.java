package com.project.jarihana.activitypost.query.controller.dto;

import com.project.jarihana.activitypost.query.service.dto.ActivityPostCommentListResult;
import java.time.LocalDateTime;
import java.util.List;

public record ActivityPostCommentListResponse(List<Item> items, String nextCursor, boolean hasNext) {

    public static ActivityPostCommentListResponse from(ActivityPostCommentListResult result) {
        return new ActivityPostCommentListResponse(
                result.items().stream().map(Item::from).toList(),
                result.nextCursor(),
                result.hasNext()
        );
    }

    public record Item(
            Long id,
            String authorNickname,
            String content,
            LocalDateTime createdAt,
            boolean canDelete,
            List<ActivityReactionResponse> reactions
    ) {

        private static Item from(ActivityPostCommentListResult.Item item) {
            return new Item(
                    item.id(),
                    item.authorNickname(),
                    item.content(),
                    item.createdAt(),
                    item.canDelete(),
                    item.reactions().stream().map(ActivityReactionResponse::from).toList()
            );
        }
    }
}
