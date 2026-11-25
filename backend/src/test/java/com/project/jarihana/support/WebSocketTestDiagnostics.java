package com.project.jarihana.support;

import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;
import org.springframework.web.socket.handler.WebSocketSessionDecorator;

import java.io.IOException;
import java.util.Comparator;
import java.util.Map;
import java.util.Queue;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.stream.Collectors;

public class WebSocketTestDiagnostics implements WebSocketMessageBrokerConfigurer {
    public static final String HEADER = "X-Test-WebSocket-Trace";
    private final Map<String, Trace> traces = new ConcurrentHashMap<>();

    public Trace start() {
        Trace trace = new Trace();
        traces.put(trace.id, trace);
        return trace;
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        registration.addDecoratorFactory(this::observe);
    }

    private WebSocketHandler observe(WebSocketHandler handler) {
        return new WebSocketHandlerDecorator(handler) {
            private Trace trace(WebSocketSession session) {
                String id = session.getHandshakeHeaders().getFirst(HEADER);
                return id == null ? null : traces.get(id);
            }

            @Override
            public void afterConnectionEstablished(WebSocketSession session) throws Exception {
                Trace trace = trace(session);
                super.afterConnectionEstablished(
                        trace == null ? session : trace.observeWrites(session));
                if (trace != null) {
                    trace.observeBuffer(WebSocketHandlerDecorator.unwrap(handler), session.getId());
                }
            }

            @Override
            public void handleMessage(WebSocketSession session, WebSocketMessage<?> message)
                    throws Exception {
                Trace trace = trace(session);
                if (trace != null && message instanceof TextMessage text) {
                    if (text.getPayload().startsWith("SUBSCRIBE\n")) {
                        trace.record("server received SUBSCRIBE");
                    } else if (text.getPayload().startsWith("SEND\n")) {
                        trace.record("server received SEND");
                    }
                }
                super.handleMessage(session, message);
            }
        };
    }

    public final class Trace implements AutoCloseable {
        private final String id = UUID.randomUUID().toString();
        private final long start = System.nanoTime();
        private final Queue<Event> events = new ConcurrentLinkedQueue<>();
        private volatile ConcurrentWebSocketSessionDecorator buffer;
        private volatile ReentrantLock flushLock;

        public String id() {
            return id;
        }

        // Spring 7.0.x exposes the enqueue callback on the session but keeps its registry private.
        // Attach before CONNECT, only to the tagged session, and leave an existing callback intact.
        private void observeBuffer(WebSocketHandler handler, String sessionId) {
            try {
                var sessions = (Map<?, ?>) ReflectionTestUtils.getField(handler, "sessions");
                Object holder = sessions == null ? null : sessions.get(sessionId);
                if (holder == null || !(ReflectionTestUtils.getField(holder, "session")
                        instanceof ConcurrentWebSocketSessionDecorator actual)) {
                    record("enqueue probe unavailable: session not found");
                    return;
                }
                buffer = actual;
                flushLock = (ReentrantLock) ReflectionTestUtils.getField(actual, "flushLock");
                if (ReflectionTestUtils.getField(actual, "preSendCallback") != null) {
                    record("enqueue probe unavailable: callback already set");
                    return;
                }
                actual.setMessageCallback(message -> {
                    String command = observedCommand(message);
                    if (command != null) record(command + " enqueued");
                });
                record("buffer probe attached");
            } catch (IllegalArgumentException | ClassCastException mismatch) {
                record("enqueue probe unavailable: " + mismatch.getClass().getSimpleName());
            }
        }

        public void record(String action) {
            long elapsed = System.nanoTime() - start;
            var currentBuffer = buffer;
            int bytes = currentBuffer == null ? -1 : currentBuffer.getBufferSize();
            events.add(new Event(elapsed, Thread.currentThread().getName(), action, bytes, lockOwner()));
        }

        private String lockOwner() {
            var lock = flushLock;
            if (lock == null) return "?";
            if (lock.isHeldByCurrentThread()) return "self";
            return lock.isLocked() ? "other" : "free";
        }

        private WebSocketSession observeWrites(WebSocketSession session) {
            return new WebSocketSessionDecorator(session) {
                @Override
                public void sendMessage(WebSocketMessage<?> message) throws IOException {
                    String command = observedCommand(message);
                    if (command == null) {
                        super.sendMessage(message);
                        return;
                    }
                    record(command + " write started");
                    try {
                        super.sendMessage(message);
                        record(command + " write returned");
                    } catch (IOException | RuntimeException failure) {
                        record(command + " write failed (" + failure.getClass().getSimpleName() + ")");
                        throw failure;
                    }
                }

                @Override
                public void close(CloseStatus status) throws IOException {
                    record("server close " + status.getCode());
                    super.close(status);
                }
            };
        }

        @Override
        public String toString() {
            return events.stream()
                    .sorted(Comparator.comparingLong(Event::nanos))
                    .map(Event::toString)
                    .collect(Collectors.joining(" | "));
        }

        @Override
        public void close() {
            traces.remove(id);
        }
    }

    private static String observedCommand(WebSocketMessage<?> message) {
        if (message instanceof TextMessage text) {
            if (text.getPayload().startsWith("CONNECTED\n")) return "CONNECTED";
            if (text.getPayload().startsWith("ERROR\n")) return "ERROR";
        }
        return null;
    }

    private record Event(long nanos, String thread, String action, int bufferedBytes, String flushLock) {
        @Override
        public String toString() {
            return "+" + TimeUnit.NANOSECONDS.toMicros(nanos) + "us " + action + " ["
                    + thread + " bytes=" + bufferedBytes + " flush=" + flushLock + "]";
        }
    }
}
