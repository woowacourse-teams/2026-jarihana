package com.project.jarihana.activitypost.query.service.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record ActivityPostListResult(List<Item> items, String nextCursor, boolean hasNext) {

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
            List<ActivityReactionResult> reactions
    ) {

        public Item {
            reactions = List.copyOf(reactions);
        }
    }

    public record Group(Long id, String name, String type, String status, boolean recruiting, boolean joined) {
    }
}
