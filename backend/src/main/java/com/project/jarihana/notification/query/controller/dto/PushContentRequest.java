package com.project.jarihana.notification.query.controller.dto;
import com.project.jarihana.notification.query.service.dto.PushContentQuery;
import com.project.jarihana.notification.query.service.dto.NotificationClientVersion;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
public record PushContentRequest(@Positive long subscriptionId, @Positive long generation,
                                 @Min(1) @Max(2) Integer clientVersion) {
    public PushContentRequest {
        clientVersion = clientVersion == null ? 1 : clientVersion;
    }

    public PushContentQuery toQuery() {
        return new PushContentQuery(subscriptionId, generation, NotificationClientVersion.from(clientVersion));
    }
}
