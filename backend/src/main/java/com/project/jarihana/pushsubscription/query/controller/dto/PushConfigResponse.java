package com.project.jarihana.pushsubscription.query.controller.dto;
import java.util.List;
import com.project.jarihana.pushsubscription.query.service.dto.PushConfigResult;
public record PushConfigResponse(boolean enabled, String vapidPublicKey, List<Integer> payloadVersions) {
    public PushConfigResponse { payloadVersions = List.copyOf(payloadVersions); }
    public static PushConfigResponse from(PushConfigResult result) {
        return new PushConfigResponse(result.enabled(), result.vapidPublicKey(), result.payloadVersions());
    }
}
