package com.project.jarihana.pushsubscription.command.controller.dto;
import com.project.jarihana.pushsubscription.command.service.dto.RegisterPushSubscriptionCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
public record PushSubscriptionRequest(@NotBlank String endpoint, @NotNull @Valid Keys keys,
                                      @Min(1) @Max(2) Integer clientVersion) {
    public PushSubscriptionRequest {
        clientVersion = clientVersion == null ? 1 : clientVersion;
    }
    public record Keys(@NotBlank String p256dh, @NotBlank String auth) { }
    public RegisterPushSubscriptionCommand toCommand() {
        return new RegisterPushSubscriptionCommand(endpoint, keys.p256dh(), keys.auth(), clientVersion);
    }
}
