package com.project.jarihana.notificationdelivery.command.controller.dto;

public record CommandResponse(boolean success, String code, String message, AuthorityResponse authority) { }
