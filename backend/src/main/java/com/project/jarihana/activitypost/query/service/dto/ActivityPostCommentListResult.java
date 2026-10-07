package com.project.jarihana.activitypost.query.service.dto;

import java.time.LocalDateTime;
import java.util.List;

public record ActivityPostCommentListResult(List<Item> items, String nextCursor, boolean hasNext) {

    public record Item(
            Long id,
            String authorNickname,
            String content,
            LocalDateTime createdAt,
            boolean canDelete,
            List<ActivityReactionResult> reactions
    ) {

        public Item {
            reactions = List.copyOf(reactions);
        }
    }
}
