package com.project.jarihana.realtime.transport.websocket;

import com.project.jarihana.realtime.auth.AdmissionTokenVerifier.Identity;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.ObjectMapper;

public final class Peer {
    private static final AtomicLong NEXT_ORDER = new AtomicLong();
    private final long order = NEXT_ORDER.incrementAndGet();
    private final WebSocketSession socket;
    private final SessionOutbound outbound;
    private final String generation = UUID.randomUUID().toString();
    private final AtomicBoolean closed = new AtomicBoolean();
    private final AtomicBoolean authenticating = new AtomicBoolean();
    private final AtomicBoolean admissionRecorded = new AtomicBoolean();
    private final AtomicBoolean refreshing = new AtomicBoolean();
    private final Executor closers;
    private final RealtimeSocketMetrics metrics;
    private final long openedAt;
    private volatile long lastSeen;
    private volatile long disconnectedAt;
    private volatile Identity identity;
    private volatile boolean joined;
    private long rateWindow;
    private int messages;

    public Peer(WebSocketSession socket, ObjectMapper mapper, Executor writers, Executor closers, int bytes, long now,
            RealtimeSocketMetrics metrics) {
        this.socket = socket;
        this.closers = closers;
        this.metrics = metrics;
        openedAt = now;
        lastSeen = now;
        outbound = new SessionOutbound(socket, mapper, writers, bytes, reason -> close(4004, reason));
    }

    public synchronized boolean receive(long now) {
        lastSeen = now;
        if (now - rateWindow >= 1000) { rateWindow = now; messages = 0; }
        return ++messages <= 60;
    }

    public boolean beginAuth() { return authenticating.compareAndSet(false, true); }
    public boolean beginRefresh() { return refreshing.compareAndSet(false, true); }
    public void endRefresh() { refreshing.set(false); }
    public void identify(Identity value) { identity = value; }
    public void joined() {
        joined = true;
        if (admissionRecorded.compareAndSet(false, true)) metrics.accepted(identity);
    }
    public boolean isJoined() { return joined; }
    public void send(Map<String, Object> message, boolean movement, long now) { outbound.enqueue(message, movement, now); }

    public void close(int code, String reason) {
        if (!closed.compareAndSet(false, true)) return;
        metrics.closed(reason);
        recordRejectedAdmission();
        disconnectedAt = System.currentTimeMillis();
        outbound.close();
        try {
            closers.execute(() -> {
                try { if (socket.isOpen()) socket.close(new CloseStatus(code, reason)); }
                catch (IOException ignored) { /* Transport already failed; local state is closed. */ }
            });
        } catch (java.util.concurrent.RejectedExecutionException error) {
            // Shutdown closes transport connectors; no further state is accepted for this peer.
        }
    }

    public void disconnected(long now) {
        if (closed.compareAndSet(false, true) && recordRejectedAdmission()) metrics.closed("DISCONNECTED");
        disconnectedAt = now;
        outbound.close();
    }

    private boolean recordRejectedAdmission() {
        if (!admissionRecorded.compareAndSet(false, true)) return false;
        metrics.rejected(identity);
        return true;
    }

    public boolean isClosed() { return closed.get(); }
    public boolean stalled(long now) { return outbound.stalled(now); }
    public long bufferedBytes() { return outbound.bufferedBytes(); }
    public long openedAt() { return openedAt; }
    public long lastSeen() { return lastSeen; }
    public long disconnectedAt() { return disconnectedAt; }
    public String generation() { return generation; }
    public long order() { return order; }
    public Identity identity() { return identity; }
    public String socketId() { return socket.getId(); }
}
