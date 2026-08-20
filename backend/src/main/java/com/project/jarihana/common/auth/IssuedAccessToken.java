package com.project.jarihana.common.auth;

import java.time.Duration;

public record IssuedAccessToken(String value, Duration validity) {
}
