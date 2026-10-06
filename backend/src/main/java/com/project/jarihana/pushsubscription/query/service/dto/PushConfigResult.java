package com.project.jarihana.pushsubscription.query.service.dto;

import java.util.List;

public record PushConfigResult(boolean enabled, String vapidPublicKey, List<Integer> payloadVersions) {
    public PushConfigResult { payloadVersions = List.copyOf(payloadVersions); }
}
