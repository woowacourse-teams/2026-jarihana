package com.project.jarihana.common.logging;

import java.util.Map;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.spi.LoggingEventBuilder;

final class Events {
    private static final Logger LOG = LoggerFactory.getLogger(Events.class);
    private Events() { }

    static void emit(String action, String category, String type, String outcome, long duration,
                     Map<String, Object> fields) {
        try {
            LoggingEventBuilder event = LOG.atInfo().addKeyValue("event.action", action)
                    .addKeyValue("event.type", List.of(type))
                    .addKeyValue("event.outcome", outcome).addKeyValue("event.duration", duration);
            if (category != null) {
                event.addKeyValue("event.category", List.of(category));
            }
            fields.forEach(event::addKeyValue);
            event.log(action);
        } catch (RuntimeException ignored) {
            // Telemetry failures must not change a committed operation's result.
        }
    }
}
