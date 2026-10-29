package com.project.jarihana.pushsubscription.command.service.dto;
public record RegisterPushSubscriptionCommand(String endpoint, String p256dh, String auth, int clientVersion) {
    public RegisterPushSubscriptionCommand(String endpoint, String p256dh, String auth) {
        this(endpoint, p256dh, auth, 1);
    }
}
