package com.project.jarihana.notificationdelivery.client.dto;
import java.time.Duration;
public record PushResult(Outcome outcome, String errorCode, Duration retryAfter) {
    public enum Outcome { ACCEPTED, RETRY, GONE, FAILED }
    public static PushResult accepted() { return new PushResult(Outcome.ACCEPTED, null, null); }
}
