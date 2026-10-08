package com.project.jarihana.pushsubscription.query.controller.dto;
import com.project.jarihana.pushsubscription.query.service.dto.PushSubscriptionListQuery;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
public record PushSubscriptionListRequest(String cursor, @Min(1) @Max(100) Integer size) {
    public PushSubscriptionListRequest { size = size == null ? 20 : size; }
    public PushSubscriptionListQuery toQuery() { return new PushSubscriptionListQuery(cursor, size); }
}
