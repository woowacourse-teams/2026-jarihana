package com.project.jarihana.announcement.query.service.dto;

import com.project.jarihana.announcement.domain.AnnouncementScope;

import java.time.LocalDateTime;
import java.util.List;

public record AnnouncementListResult(List<Item> items, String nextCursor, boolean hasNext) {

    public AnnouncementListResult {
        items = List.copyOf(items);
    }

    public record Item(long id, String title, AnnouncementScope scope, String authorNickname, LocalDateTime createdAt) {
    }
}
