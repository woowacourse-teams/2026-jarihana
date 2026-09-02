package com.project.jarihana.auth.token;

import java.time.Duration;

public record IssuedRefreshToken(String value, Duration validity) {
}
