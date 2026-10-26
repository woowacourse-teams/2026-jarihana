package com.project.jarihana.notificationdelivery.command.controller.dto;

public record ActivityResponse(int httpInFlight, int backgroundInFlight, boolean backgroundDrained) { }
