package com.project.jarihana.sparring.stream;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

final class SparringBenchmarkJdbcTimeline {
    private final long nanoOrigin = System.nanoTime();
    private final Instant epoch = Instant.now();
    private final long microsOrigin = epoch.getEpochSecond() * 1_000_000L + epoch.getNano() / 1_000;
    private final ConcurrentLinkedQueue<String> events = new ConcurrentLinkedQueue<>();
    private final BufferedWriter trace;

    SparringBenchmarkJdbcTimeline() {
        try {
            trace = Files.newBufferedWriter(Path.of("/tmp/sparring-jdbc-timeline.csv"));
            trace.write("operation,pid,request_id,requested_us,acquired_us,closed_us\n");
            trace.flush();
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
        var flusher = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon().name("sparring-jdbc-trace").factory());
        flusher.scheduleWithFixedDelay(this::flush, 250, 250, TimeUnit.MILLISECONDS);
    }

    void record(String op, int pid, UUID request, long requested, long acquired, long closed) {
        events.add((op == null ? "other" : op) + "," + pid + ","
                + (request == null ? "" : request) + "," + micros(requested) + "," + micros(acquired) + ","
                + micros(closed) + "\n");
    }

    private long micros(long nanos) {
        return microsOrigin + TimeUnit.NANOSECONDS.toMicros(nanos - nanoOrigin);
    }

    private void flush() {
        try {
            String line;
            while ((line = events.poll()) != null) trace.write(line);
            trace.flush();
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }
}
