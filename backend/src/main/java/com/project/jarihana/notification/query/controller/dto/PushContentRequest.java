package com.project.jarihana.notification.query.controller.dto;
import com.project.jarihana.notification.query.service.dto.PushContentQuery;
import jakarta.validation.constraints.Positive;
public record PushContentRequest(@Positive long subscriptionId, @Positive long generation) {
    public PushContentQuery toQuery() { return new PushContentQuery(subscriptionId, generation); }
}
