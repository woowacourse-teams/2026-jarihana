package com.project.jarihana.auth.token;

import java.time.Duration;

public record IssuedAccessToken(String value, Duration validity) {
}
