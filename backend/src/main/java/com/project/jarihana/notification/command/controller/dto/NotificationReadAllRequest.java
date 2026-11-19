package com.project.jarihana.notification.command.controller.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record NotificationReadAllRequest(@Min(1) @Max(3) Integer clientVersion) {
}
