package com.project.jarihana.realtime.transport.websocket;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.function.Consumer;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.ObjectMapper;

/** A single writer per connection; movement may be replaced only after the last control barrier. */
public final class SessionOutbound {
    private record Packet(TextMessage message, boolean movement, long queuedAt) {}
    private final WebSocketSession socket;
    private final ObjectMapper mapper;
    private final Executor writers;
    private final int byteLimit;
    private final Consumer<String> failure;
    private final Deque<Packet> queue = new ArrayDeque<>();
    private long bytes;
    private boolean scheduled;
    private boolean closed;
    private volatile long sendingSince;

    public SessionOutbound(WebSocketSession socket, ObjectMapper mapper, Executor writers, int byteLimit, Consumer<String> failure) {
        this.socket = socket;
        this.mapper = mapper;
        this.writers = writers;
        this.byteLimit = byteLimit;
        this.failure = failure;
    }

    public synchronized boolean enqueue(Map<String, Object> value, boolean movement, long now) {
        if (closed || !socket.isOpen()) return false;
        Packet packet = new Packet(new TextMessage(mapper.writeValueAsBytes(value)), movement, now);
        if (movement && !queue.isEmpty() && queue.peekLast().movement()) bytes -= queue.removeLast().message().getPayloadLength();
        if (bytes + packet.message().getPayloadLength() > byteLimit || queue.size() >= 256) {
            closed = true;
            queue.clear();
            bytes = 0;
            failure.accept("SLOW_CONSUMER");
            return false;
        }
        queue.addLast(packet);
        bytes += packet.message().getPayloadLength();
        if (!scheduled) {
            scheduled = true;
            try { writers.execute(this::drain); }
            catch (RejectedExecutionException error) {
                closed = true;
                queue.clear();
                bytes = 0;
                failure.accept("OVERLOADED");
                return false;
            }
        }
        return true;
    }

    private void drain() {
        while (true) {
            Packet packet;
            synchronized (this) {
                packet = closed ? null : queue.pollFirst();
                if (packet == null) { scheduled = false; return; }
                bytes -= packet.message().getPayloadLength();
                sendingSince = System.currentTimeMillis();
            }
            try { socket.sendMessage(packet.message()); }
            catch (IOException | IllegalStateException error) {
                failure.accept("TRANSPORT_ERROR");
                close();
                return;
            } finally { sendingSince = 0; }
        }
    }

    public synchronized boolean stalled(long now) {
        return sendingSince > 0 && now - sendingSince > 5000 || !queue.isEmpty() && now - queue.peekFirst().queuedAt() > 5000;
    }

    public synchronized long bufferedBytes() { return bytes; }
    public synchronized void close() { closed = true; queue.clear(); bytes = 0; }
}
