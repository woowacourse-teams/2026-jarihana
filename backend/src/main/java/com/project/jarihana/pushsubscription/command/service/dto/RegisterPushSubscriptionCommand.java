package com.project.jarihana.pushsubscription.command.service.dto;
public record RegisterPushSubscriptionCommand(String endpoint, String p256dh, String auth) { }
