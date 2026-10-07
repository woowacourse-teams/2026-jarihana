package com.project.jarihana.auth.command.controller.dto;
import com.project.jarihana.pushsubscription.command.service.dto.DisconnectPushSubscriptionCommand;
import jakarta.validation.constraints.Positive;
public record LogoutRequest(@Positive long pushSubscriptionId, @Positive long generation) {
    public DisconnectPushSubscriptionCommand toCommand() {
        return new DisconnectPushSubscriptionCommand(pushSubscriptionId, generation);
    }
}
