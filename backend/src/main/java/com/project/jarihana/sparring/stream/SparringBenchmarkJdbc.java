package com.project.jarihana.sparring.stream;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

import net.ttddyy.dsproxy.ExecutionInfo;
import net.ttddyy.dsproxy.QueryInfo;
import net.ttddyy.dsproxy.listener.MethodExecutionContext;
import net.ttddyy.dsproxy.listener.MethodExecutionListener;
import net.ttddyy.dsproxy.listener.QueryExecutionListener;
import net.ttddyy.observation.boot.autoconfigure.ProxyDataSourceBuilderCustomizer;

import org.postgresql.PGConnection;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.sql.Connection;
import java.sql.SQLException;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import javax.sql.DataSource;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "sparring.benchmark.jdbc", havingValue = "true")
public class SparringBenchmarkJdbc {
    private static final ThreadLocal<String> operation = new ThreadLocal<>();
    private static final ThreadLocal<UUID> requestId = new ThreadLocal<>();
    private static volatile boolean enabled;

    public static <T> T measure(String name, Supplier<T> action) {
        return measure(name, null, action);
    }

    public static <T> T measure(String name, UUID request, Supplier<T> action) {
        if (!enabled) return action.get();
        operation.set(name);
        if (request != null) requestId.set(request);
        try {
            return action.get();
        } finally {
            operation.remove();
            requestId.remove();
        }
    }

    @Bean
    ProxyDataSourceBuilderCustomizer sparringJdbcMetrics(
            MeterRegistry registry,
            @Value("${sparring.benchmark.jdbc-timeline:false}") boolean timelineEnabled) {
        Map<String, Timer> timers = new HashMap<>();
        Duration[] buckets = java.util.stream.LongStream.of(
                        1, 2, 3, 5, 8, 12, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750,
                        1000, 1500, 2000, 3000, 5000, 8000, 10000)
                .mapToObj(Duration::ofMillis)
                .toArray(Duration[]::new);
        for (String op : List.of("write", "read", "reconcile")) {
            for (String stage : List.of("acquire", "hold", "commit", "topic_lock")) {
                timers.put(op + ":" + stage, Timer.builder("sparring.benchmark.jdbc")
                        .tag("operation", op)
                        .tag("stage", stage)
                        .serviceLevelObjectives(buckets)
                        .register(registry));
            }
        }
        var listener = new JdbcListener(Map.copyOf(timers),
                timelineEnabled ? new SparringBenchmarkJdbcTimeline() : null);
        enabled = true;
        return (builder, source, beanName, dataSourceName) ->
                builder.methodListener(listener).listener(listener);
    }

    private record Lease(String operation, long requested, long acquired, int pid, UUID request) {}

    private static final class JdbcListener implements MethodExecutionListener, QueryExecutionListener {
        private final Map<String, Timer> timers;
        private final Map<String, Lease> leases = new ConcurrentHashMap<>();

        private final SparringBenchmarkJdbcTimeline timeline;

        JdbcListener(Map<String, Timer> timers, SparringBenchmarkJdbcTimeline timeline) {
            this.timers = timers;
            this.timeline = timeline;
        }

        @Override
        public void beforeMethod(MethodExecutionContext context) {
            String name = context.getMethod().getName();
            if ((name.equals("getConnection") && context.getTarget() instanceof DataSource
                            && (timeline != null || operation.get() != null))
                    || (name.equals("commit") && context.getTarget() instanceof Connection
                            && operation.get() != null)) {
                context.addCustomValue("sparringStart", System.nanoTime());
            }
        }

        @Override
        public void afterMethod(MethodExecutionContext context) {
            String name = context.getMethod().getName();
            Long start = context.getCustomValue("sparringStart", Long.class);
            if (start != null && name.equals("getConnection")) {
                long now = System.nanoTime();
                String op = operation.get();
                if (op != null) record(op, "acquire", now - start);
                if (context.getThrown() == null) {
                    int pid = timeline == null ? 0 : backendPid((Connection) context.getResult());
                    leases.put(context.getConnectionInfo().getConnectionId(), new Lease(op, start, now, pid, requestId.get()));
                }
            } else if (start != null && name.equals("commit")) {
                record(operation.get(), "commit", System.nanoTime() - start);
            } else if (name.equals("close") && context.getTarget() instanceof Connection) {
                Lease lease = leases.remove(context.getConnectionInfo().getConnectionId());
                if (lease != null) {
                    long closed = System.nanoTime();
                    if (lease.operation() != null) record(lease.operation(), "hold", closed - lease.acquired());
                    if (timeline != null) timeline.record(
                            lease.operation(), lease.pid(), lease.request(), lease.requested(), lease.acquired(), closed);
                }
            }
        }

        @Override
        public void beforeQuery(ExecutionInfo info, List<QueryInfo> queries) {
            if ("write".equals(operation.get()) && queries.stream().anyMatch(query -> {
                String sql = query.getQuery();
                return sql.contains("sparring_topic")
                        && (sql.contains("for no key update") || sql.contains("for update"));
            })) {
                info.addCustomValue("sparringLockStart", System.nanoTime());
            }
        }

        @Override
        public void afterQuery(ExecutionInfo info, List<QueryInfo> queries) {
            Long start = info.getCustomValue("sparringLockStart", Long.class);
            if (start != null) record("write", "topic_lock", System.nanoTime() - start);
        }

        private int backendPid(Connection connection) {
            try {
                return connection.unwrap(PGConnection.class).getBackendPID();
            } catch (SQLException exception) {
                return 0;
            }
        }

        private void record(String op, String stage, long nanos) {
            timers.get(op + ":" + stage).record(nanos, TimeUnit.NANOSECONDS);
        }
    }
}
