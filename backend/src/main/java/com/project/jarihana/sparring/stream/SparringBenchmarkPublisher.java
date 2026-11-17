package com.project.jarihana.sparring.stream;

import com.project.jarihana.sparring.command.service.dto.SparringRevisionChanged;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Component
@ConditionalOnProperty(name = "sparring.benchmark.batch-publish", havingValue = "true")
class SparringBenchmarkPublisher {
    private static final Logger log = LoggerFactory.getLogger(SparringBenchmarkPublisher.class);

    private final JdbcTemplate jdbc;
    private final Counter published;
    private final Counter batches;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().daemon().name("sparring-publisher").factory());
    private Set<Long> pending = new HashSet<>();

    SparringBenchmarkPublisher(JdbcTemplate jdbc, MeterRegistry meters) {
        this.jdbc = jdbc;
        this.published = meters.counter("sparring.benchmark.notifications.published");
        this.batches = meters.counter("sparring.benchmark.notifications.batches");
    }

    @PostConstruct
    void start() {
        scheduler.scheduleWithFixedDelay(this::publish, 1, 1, TimeUnit.SECONDS);
    }

    @TransactionalEventListener
    synchronized void committed(SparringRevisionChanged change) {
        pending.add(change.topicId());
    }

    private void publish() {
        Set<Long> rooms;
        synchronized (this) {
            if (pending.isEmpty()) return;
            rooms = pending;
            pending = new HashSet<>();
        }

        String ids = rooms.stream().map(String::valueOf).collect(Collectors.joining(","));
        try {
            jdbc.query("""
                    select pg_notify('sparring_benchmark_revision', room.id || ':batch')
                    from unnest(string_to_array(?, ',')::bigint[]) as room(id)
                    """, statement -> statement.setString(1, ids), result -> null);
            published.increment(rooms.size());
            batches.increment();
        } catch (RuntimeException exception) {
            synchronized (this) {
                pending.addAll(rooms);
            }
            log.warn("Sparring notification batch failed", exception);
        }
    }

    @PreDestroy
    void close() {
        scheduler.shutdownNow();
    }
}
