package com.project.jarihana.support;

import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;
import org.springframework.web.socket.handler.WebSocketSessionDecorator;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

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
            }

            @Override
            public void handleMessage(WebSocketSession session, WebSocketMessage<?> message)
                    throws Exception {
                Trace trace = trace(session);
                if (trace != null && message instanceof TextMessage text) {
                    if (text.getPayload().startsWith("SUBSCRIBE\n")) trace.received = "SUBSCRIBE";
                    if (text.getPayload().startsWith("SEND\n")) trace.received = "SEND";
                }
                super.handleMessage(session, message);
            }
        };
    }

    public final class Trace implements AutoCloseable {
        private final String id = UUID.randomUUID().toString();
        private volatile String received = "unobserved";
        private volatile String errorWrite = "unobserved";

        public String id() {
            return id;
        }

        private WebSocketSession observeWrites(WebSocketSession session) {
            return new WebSocketSessionDecorator(session) {
                @Override
                public void sendMessage(WebSocketMessage<?> message) throws IOException {
                    if (!(message instanceof TextMessage text)
                            || !text.getPayload().startsWith("ERROR\n")) {
                        super.sendMessage(message);
                        return;
                    }
                    errorWrite = "started";
                    try {
                        super.sendMessage(message);
                        errorWrite = "returned";
                    } catch (IOException | RuntimeException failure) {
                        errorWrite = "failed (" + failure.getClass().getSimpleName() + ")";
                        throw failure;
                    }
                }
            };
        }

        @Override
        public String toString() {
            return "server received=" + received + ", ERROR write=" + errorWrite;
        }

        @Override
        public void close() {
            traces.remove(id);
        }
    }
}
