package com.project.jarihana.pushsubscription.command.service.dto;
import com.project.jarihana.pushsubscription.domain.PushSubscription;
import java.time.LocalDateTime;
public record PushSubscriptionResult(long id, long generation, boolean enabled, LocalDateTime lastSeenAt, boolean created) {
    public static PushSubscriptionResult from(PushSubscription item, boolean created) {
        return new PushSubscriptionResult(item.getId(), item.getGeneration(), item.isEnabled(), item.getLastSeenAt(), created);
    }
}
