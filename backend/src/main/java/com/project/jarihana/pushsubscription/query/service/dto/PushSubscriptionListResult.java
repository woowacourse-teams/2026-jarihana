package com.project.jarihana.pushsubscription.query.service.dto;
import java.time.LocalDateTime;
import java.util.List;
public record PushSubscriptionListResult(List<Item> items, String nextCursor, boolean hasNext) {
    public PushSubscriptionListResult { items = List.copyOf(items); }
    public record Item(long id, long generation, boolean enabled, LocalDateTime lastSeenAt) { }
}
