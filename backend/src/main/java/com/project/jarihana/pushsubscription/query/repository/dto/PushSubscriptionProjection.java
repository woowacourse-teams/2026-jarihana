package com.project.jarihana.pushsubscription.query.repository.dto;
import java.time.LocalDateTime;
public record PushSubscriptionProjection(long id, long generation, boolean enabled, LocalDateTime lastSeenAt, LocalDateTime createdAt) { }
