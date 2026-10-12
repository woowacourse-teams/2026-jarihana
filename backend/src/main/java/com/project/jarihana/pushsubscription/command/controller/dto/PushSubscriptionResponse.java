package com.project.jarihana.pushsubscription.command.controller.dto;
import com.project.jarihana.pushsubscription.command.service.dto.PushSubscriptionResult;
import java.time.LocalDateTime;
public record PushSubscriptionResponse(long id, long generation, boolean enabled, LocalDateTime lastSeenAt) {
    public static PushSubscriptionResponse from(PushSubscriptionResult result) {
        return new PushSubscriptionResponse(result.id(), result.generation(), result.enabled(), result.lastSeenAt());
    }
}
