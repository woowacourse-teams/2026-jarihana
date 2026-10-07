package com.project.jarihana.pushsubscription.query.controller.dto;
import com.project.jarihana.pushsubscription.query.service.dto.PushSubscriptionListResult;
import java.time.LocalDateTime;
import java.util.List;
public record PushSubscriptionListResponse(List<ItemResponse> items, String nextCursor, boolean hasNext) {
    public PushSubscriptionListResponse { items = List.copyOf(items); }
    public record ItemResponse(long id, long generation, boolean enabled, LocalDateTime lastSeenAt) { }
    public static PushSubscriptionListResponse from(PushSubscriptionListResult result) {
        return new PushSubscriptionListResponse(result.items().stream()
                .map(s -> new ItemResponse(s.id(), s.generation(), s.enabled(), s.lastSeenAt())).toList(), result.nextCursor(), result.hasNext());
    }
}
