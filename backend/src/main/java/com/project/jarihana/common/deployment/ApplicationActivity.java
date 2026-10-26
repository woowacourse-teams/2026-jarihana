package com.project.jarihana.common.deployment;

import org.springframework.stereotype.Component;

/** 현재 프로세스의 요청·스케줄러 활동이다. 0이라는 값만으로 서버 종료를 승인하지 않는다. */
@Component
public class ApplicationActivity {
    private int httpInFlight;
    private int backgroundInFlight;

    public synchronized Activity beginHttp() {
        httpInFlight++;
        return new Activity(Kind.HTTP);
    }

    public synchronized Activity beginBackground() {
        backgroundInFlight++;
        return new Activity(Kind.BACKGROUND);
    }

    public synchronized Snapshot snapshot() {
        return new Snapshot(httpInFlight, backgroundInFlight);
    }

    public record Snapshot(int httpInFlight, int backgroundInFlight) { }

    private enum Kind { HTTP, BACKGROUND }

    public final class Activity implements AutoCloseable {
        private final Kind kind;
        private boolean closed;

        private Activity(Kind kind) { this.kind = kind; }

        @Override
        public void close() {
            synchronized (ApplicationActivity.this) {
                if (closed) { return; }
                closed = true;
                switch (kind) {
                    case HTTP -> httpInFlight--;
                    case BACKGROUND -> backgroundInFlight--;
                }
            }
        }
    }
}
