package com.project.jarihana.realtime;

import com.project.jarihana.realtime.config.RealtimeProperties;
import com.project.jarihana.realtime.config.RealtimeProperties.EnvironmentSettings;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicLong;

public final class TestSettings {
    public static final String DEV_TOKEN_KEY = "_80NtQkcKD9mw_CffGhAjISOdxrCz12QRrG9H_n7TJs";
    public static final String PROD_TOKEN_KEY = "bNsm9fU3oju3q21ta6_fvazU-45b_fBfrF-j-38mByA";

    private TestSettings() {}

    public static RealtimeProperties properties(String devKey, String prodKey) {
        var dev = new EnvironmentSettings(devKey, "jdbc:postgresql://localhost/dev", "reader", "test");
        var prod = new EnvironmentSettings(prodKey, "jdbc:postgresql://localhost/prod", "reader", "test");
        return new RealtimeProperties(true, dev, prod, Duration.ofMinutes(1),
                "http://localhost:5173", 8, 10, 100, 32, 16, 262144, 5000, 100, 200, 30000);
    }

    public static final class MutableClock extends Clock {
        private final AtomicLong now = new AtomicLong(1000);
        public void set(long value) { now.set(value); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return Instant.ofEpochMilli(now.get()); }
        @Override public long millis() { return now.get(); }
    }
}
