package com.project.jarihana.auth.command.service.dto;

import java.time.Duration;

public record IssuedRefreshToken(String value, Duration validity) {
}
