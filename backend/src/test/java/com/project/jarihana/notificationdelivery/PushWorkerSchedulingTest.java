package com.project.jarihana.notificationdelivery;

import com.project.jarihana.notificationdelivery.command.service.PushDeliveryWorker;
import com.project.jarihana.notificationdelivery.config.PushWorkerSchedulingConfig;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PushWorkerSchedulingTest {
    @ParameterizedTest
    @CsvSource({"false,true,false", "true,false,false", "true,true,true"})
    void scheduleOnlyWhenFeatureAndWorkerAreBothEnabled(boolean enabled, boolean workerEnabled, boolean scheduled) {
        // Given / When
        try (var context = context(mock(PushDeliveryWorker.class), enabled, workerEnabled, "100000")) {
            // Then
            assertThat(context.getBeansOfType(PushWorkerSchedulingConfig.class)).hasSize(scheduled ? 1 : 0);
        }
    }

    @Test
    void failedCycleDoesNotPreventFollowingScheduledCycle() throws Exception {
        // Given
        var worker = mock(PushDeliveryWorker.class);
        var calls = new AtomicInteger();
        var resumed = new CountDownLatch(1);
        when(worker.processDue()).thenAnswer(invocation -> {
            if (calls.incrementAndGet() == 1) throw new IllegalStateException("secret endpoint");
            resumed.countDown();
            return 0;
        });
        // When
        try (var context = context(worker, true, true, "25")) {
            assertThat(resumed.await(2, TimeUnit.SECONDS)).isTrue();
            // Then
            assertThat(calls.get()).isGreaterThanOrEqualTo(2);
        }
    }

    private AnnotationConfigApplicationContext context(PushDeliveryWorker worker, boolean enabled, boolean workerEnabled, String delay) {
        var context = new AnnotationConfigApplicationContext();
        context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("push-test", Map.of(
                "jarihana.push.enabled", enabled, "jarihana.push.worker-enabled", workerEnabled, "jarihana.push.poll-delay", delay)));
        context.registerBean(PushDeliveryWorker.class, () -> worker);
        context.register(PushWorkerSchedulingConfig.class);
        context.refresh();
        return context;
    }
}
