package com.project.jarihana.support;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;
import org.slf4j.LoggerFactory;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Predicate;

public final class CapturedApplicationLogs implements AutoCloseable {

    private final Logger logger = (Logger) LoggerFactory.getLogger("com.project.jarihana");
    private final List<ILoggingEvent> events = new CopyOnWriteArrayList<>();
    private final List<Subscription> subscriptions = new CopyOnWriteArrayList<>();
    private final AppenderBase<ILoggingEvent> appender = new AppenderBase<>() {
        @Override
        protected void append(ILoggingEvent event) {
            event.prepareForDeferredProcessing();
            events.add(event);
            subscriptions.stream()
                    .filter(subscription -> subscription.predicate().test(event))
                    .forEach(subscription -> subscription.result().complete(event));
        }
    };

    public CapturedApplicationLogs() {
        appender.setContext(logger.getLoggerContext());
        appender.start();
        logger.addAppender(appender);
    }

    public List<ILoggingEvent> events() {
        return List.copyOf(events);
    }

    public CompletableFuture<ILoggingEvent> subscribe(Predicate<ILoggingEvent> predicate) {
        CompletableFuture<ILoggingEvent> result = new CompletableFuture<>();
        subscriptions.add(new Subscription(predicate, result));
        return result;
    }

    public static Map<String, Object> fields(ILoggingEvent event) {
        Map<String, Object> fields = new LinkedHashMap<>(event.getMDCPropertyMap());
        if (event.getKeyValuePairs() != null) {
            event.getKeyValuePairs().forEach(pair -> fields.put(pair.key, pair.value));
        }
        return fields;
    }

    @Override
    public void close() {
        logger.detachAppender(appender);
        appender.stop();
    }

    private record Subscription(Predicate<ILoggingEvent> predicate, CompletableFuture<ILoggingEvent> result) {
    }
}
