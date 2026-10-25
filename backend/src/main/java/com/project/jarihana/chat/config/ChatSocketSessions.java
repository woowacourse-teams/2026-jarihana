package com.project.jarihana.chat.config;

import io.micrometer.core.instrument.MeterRegistry;

import jakarta.annotation.PreDestroy;

import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.WebSocketSessionDecorator;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

@Component
public class ChatSocketSessions implements SmartLifecycle {
    private volatile boolean running;
    private final Clock clock;
    private final MeterRegistry metrics;
    private final Semaphore capacity = new Semaphore(10000);
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, ScheduledFuture<?>> expirationTasks = new ConcurrentHashMap<>();
    private final ScheduledThreadPoolExecutor expiry =
            new ScheduledThreadPoolExecutor(
                    1,
                    runnable -> {
                        Thread thread = new Thread(runnable, "chat-token-expiry");
                        thread.setDaemon(true);
                        return thread;
                    });

    public ChatSocketSessions(Clock clock, MeterRegistry metrics) {
        this.clock = clock;
        this.metrics = metrics;
        expiry.setRemoveOnCancelPolicy(true);
        metrics.gauge("chat.socket.sessions", sessions, Map::size);
    }

    public synchronized void opened(WebSocketSession session) throws IOException {
        if (!running) {
            session.close(CloseStatus.GOING_AWAY);
            return;
        }
        if (!capacity.tryAcquire()) {
            session.close(CloseStatus.SERVICE_OVERLOAD);
            return;
        }
        Instant until = (Instant) session.getAttributes().get(ChatHandshakeInterceptor.EXPIRY);
        if (until == null) {
            capacity.release();
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        sessions.put(session.getId(), session);
        long delay = Math.max(0, Duration.between(clock.instant(), until).toMillis());
        expirationTasks.put(
                session.getId(),
                expiry.schedule(
                        () -> {
                            close(session, CloseStatus.POLICY_VIOLATION);
                            metrics.counter("chat.socket.expired").increment();
                        },
                        delay,
                        TimeUnit.MILLISECONDS));
        if (!sessions.containsKey(session.getId())) {
            ScheduledFuture<?> completed = expirationTasks.remove(session.getId());
            if (completed != null) completed.cancel(false);
        }
        metrics.counter("chat.socket.connected").increment();
    }

    public void closed(WebSocketSession session) {
        if (sessions.remove(session.getId()) != null) {
            capacity.release();
        }
        ScheduledFuture<?> task = expirationTasks.remove(session.getId());
        if (task != null) task.cancel(false);
    }

    public WebSocketSession observe(WebSocketSession session) {
        return new WebSocketSessionDecorator(session) {
            @Override
            public void sendMessage(WebSocketMessage<?> message) throws IOException {
                Instant until = (Instant) getAttributes().get(ChatHandshakeInterceptor.EXPIRY);
                if (until == null || !clock.instant().isBefore(until)) {
                    close(CloseStatus.POLICY_VIOLATION);
                    throw new IOException("Chat authentication expired");
                }
                try {
                    super.sendMessage(message);
                    metrics.counter("chat.socket.frames.sent").increment();
                } catch (IOException failure) {
                    metrics.counter("chat.socket.send.failure").increment();
                    throw failure;
                }
            }
        };
    }

    private void close(WebSocketSession session, CloseStatus status) {
        try {
            session.close(status);
        } catch (IOException failure) {
            metrics.counter("chat.socket.close.failure").increment();
        } finally {
            closed(session);
        }
    }

    @PreDestroy
    public void shutdown() {
        stop();
        expiry.shutdownNow();
    }

    @Override
    public synchronized void start() {
        running = true;
    }

    @Override
    public synchronized void stop() {
        running = false;
        sessions.values().forEach(session -> close(session, CloseStatus.GOING_AWAY));
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public int getPhase() {
        // Close frames must be sent before the web server and STOMP broker stop.
        return Integer.MAX_VALUE;
    }
}
