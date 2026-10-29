package com.project.jarihana.announcement.query.controller.dto;

import com.project.jarihana.announcement.query.service.dto.AnnouncementListResult;

import java.time.LocalDateTime;
import java.util.List;

public record AnnouncementListResponse(List<Item> items, String nextCursor, boolean hasNext) {

    public static AnnouncementListResponse from(AnnouncementListResult result) {
        return new AnnouncementListResponse(
                result.items().stream().map(Item::from).toList(),
                result.nextCursor(),
                result.hasNext()
        );
    }

    public record Item(long id, String title, String scope, String authorNickname, LocalDateTime createdAt) {

        private static Item from(AnnouncementListResult.Item item) {
            return new Item(item.id(), item.title(), item.scope().name(), item.authorNickname(), item.createdAt());
        }
    }
}
