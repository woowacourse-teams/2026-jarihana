package com.project.jarihana.common.config;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.context.request.async.DeferredResult;
import org.springframework.web.context.request.async.DeferredResultProcessingInterceptor;
import org.springframework.web.context.request.async.WebAsyncUtils;
import org.springframework.web.servlet.AsyncHandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

/** Counts MVC endpoints explicitly declaring text/event-stream, without tagging raw URLs. */
final class SseMetricsInterceptor implements AsyncHandlerInterceptor {
    private static final String STATE = SseMetricsInterceptor.class.getName() + ".state";
    private final MeterRegistry metrics;
    private final ConcurrentHashMap<String, AtomicInteger> active = new ConcurrentHashMap<>();

    SseMetricsInterceptor(MeterRegistry metrics) {
        this.metrics = metrics;
    }

    AtomicInteger initializeMetrics(String uri) {
        return active.computeIfAbsent(uri, key -> {
            metrics.counter("jarihana.sse.connections.attempts", "uri", key);
            for (HttpStatus status : HttpStatus.values()) {
                if (status.isError()) {
                    metrics.counter("jarihana.sse.connections.rejected", "uri", key,
                            "status", Integer.toString(status.value()));
                }
            }
            return metrics.gauge("jarihana.sse.connections.active", List.of(Tag.of("uri", key)), new AtomicInteger());
        });
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (request.getAttribute(STATE) != null || !isSse(request)) return true;
        Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        if (pattern == null) return true;
        String uri = pattern.toString();
        AtomicInteger count = initializeMetrics(uri);
        var connection = new Connection(uri, count);
        request.setAttribute(STATE, connection);
        metrics.counter("jarihana.sse.connections.attempts", "uri", uri).increment();
        WebAsyncUtils.getAsyncManager(request).registerDeferredResultInterceptor(STATE, connection);
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception exception) {
        if (request.getAttribute(STATE) instanceof Connection connection) {
            connection.finish(response.getStatus());
        }
    }

    private boolean isSse(HttpServletRequest request) {
        Object types = request.getAttribute(HandlerMapping.PRODUCIBLE_MEDIA_TYPES_ATTRIBUTE);
        return types instanceof Set<?> mediaTypes && mediaTypes.stream().anyMatch(type ->
                type instanceof MediaType media && MediaType.TEXT_EVENT_STREAM.equalsTypeAndSubtype(media));
    }

    private final class Connection implements DeferredResultProcessingInterceptor {
        private final String uri;
        private final AtomicInteger count;
        private boolean accepted;
        private boolean closed;
        private boolean finished;

        private Connection(String uri, AtomicInteger count) {
            this.uri = uri;
            this.count = count;
        }

        @Override
        public synchronized <T> void beforeConcurrentHandling(NativeWebRequest request, DeferredResult<T> result) {
            if (!accepted && !closed) {
                accepted = true;
                count.incrementAndGet();
            }
        }

        @Override
        public <T> boolean handleTimeout(NativeWebRequest request, DeferredResult<T> result) {
            close();
            return true;
        }

        @Override
        public <T> boolean handleError(NativeWebRequest request, DeferredResult<T> result, Throwable error) {
            close();
            return true;
        }

        @Override
        public <T> void afterCompletion(NativeWebRequest request, DeferredResult<T> result) {
            close();
        }

        private synchronized void finish(int status) {
            if (!finished && !accepted && status >= 400) {
                metrics.counter("jarihana.sse.connections.rejected", "uri", uri, "status", Integer.toString(status)).increment();
            }
            finished = true;
            close();
        }

        private synchronized void close() {
            if (closed) return;
            closed = true;
            if (accepted) count.decrementAndGet();
        }
    }
}
