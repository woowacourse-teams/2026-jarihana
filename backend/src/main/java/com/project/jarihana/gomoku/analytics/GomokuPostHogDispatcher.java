package com.project.jarihana.gomoku.analytics;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "gomoku.posthog", name = "enabled", havingValue = "true")
public class GomokuPostHogDispatcher {
    private final GomokuPostHogOutbox outbox;
    private final GomokuPostHogClient client;

    @Transactional
    public void deliverPending() {
        var events = outbox.lockPending();
        if (events.isEmpty()) return;
        client.capture(events);
        outbox.remove(events);
    }
}
