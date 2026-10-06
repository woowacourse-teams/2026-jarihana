package com.project.jarihana.notificationdelivery.client.dto;
import java.time.LocalDateTime;
public record PushRequest(long deliveryId, long notificationId, long subscriptionId, long generation,
                          int payloadVersion, String endpoint, String p256dh, String auth, LocalDateTime expiresAt) {
    @Override
    public String toString() { return "PushRequest[deliveryId=" + deliveryId + "]"; }
}
