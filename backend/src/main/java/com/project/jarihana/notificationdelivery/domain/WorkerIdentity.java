package com.project.jarihana.notificationdelivery.domain;

import java.util.Objects;
import java.util.UUID;

public record WorkerIdentity(String hostId, UUID bootId) {
    public WorkerIdentity {
        Objects.requireNonNull(hostId);
        Objects.requireNonNull(bootId);
        if (hostId.isBlank()) { throw new IllegalArgumentException("worker host ID가 필요합니다."); }
    }
}
