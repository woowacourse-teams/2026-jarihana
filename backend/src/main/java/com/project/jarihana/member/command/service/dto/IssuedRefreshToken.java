package com.project.jarihana.member.command.service.dto;

import java.time.Duration;

public record IssuedRefreshToken(String value, Duration validity) {
}
