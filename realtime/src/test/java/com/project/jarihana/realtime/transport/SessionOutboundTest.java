package com.project.jarihana.realtime.transport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.project.jarihana.realtime.transport.websocket.SessionOutbound;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.json.JsonMapper;

class SessionOutboundTest {
    @Test
    void movementCoalescingNeverCrossesControlBarrier() throws Exception {
        var socket = mock(WebSocketSession.class);
        when(socket.isOpen()).thenReturn(true);
        List<Runnable> scheduled = new ArrayList<>();
        List<String> sent = new ArrayList<>();
        doAnswer(invocation -> { sent.add(((TextMessage) invocation.getArgument(0)).getPayload()); return null; }).when(socket).sendMessage(any());
        var outbound = new SessionOutbound(socket, JsonMapper.builder().build(), scheduled::add, 4096, reason -> { throw new AssertionError(reason); });
        outbound.enqueue(Map.of("seq", 1), true, 1000);
        outbound.enqueue(Map.of("seq", 2), true, 1000);
        outbound.enqueue(Map.of("type", "CONTROL"), false, 1000);
        outbound.enqueue(Map.of("seq", 3), true, 1000);
        outbound.enqueue(Map.of("seq", 4), true, 1000);
        assertThat(scheduled).hasSize(1);
        scheduled.getFirst().run();
        assertThat(sent).containsExactly("{\"seq\":2}", "{\"type\":\"CONTROL\"}", "{\"seq\":4}");
        assertThat(outbound.bufferedBytes()).isZero();
    }

    @Test
    void slowConsumerIsBoundedByBytesAndTime() {
        var socket = mock(WebSocketSession.class);
        when(socket.isOpen()).thenReturn(true);
        List<String> failures = new ArrayList<>();
        var outbound = new SessionOutbound(socket, JsonMapper.builder().build(), ignored -> {}, 40, failures::add);
        assertThat(outbound.enqueue(Map.of("text", "x".repeat(20)), false, 1000)).isTrue();
        assertThat(outbound.stalled(7000)).isTrue();
        assertThat(outbound.enqueue(Map.of("text", "x".repeat(20)), false, 1000)).isFalse();
        assertThat(failures).containsExactly("SLOW_CONSUMER");
        assertThat(outbound.bufferedBytes()).isZero();
    }

    @Test
    void concurrentProducersStillUseOnlyOneSocketWriter() throws Exception {
        var socket = mock(WebSocketSession.class);
        when(socket.isOpen()).thenReturn(true);
        AtomicInteger concurrent = new AtomicInteger(), max = new AtomicInteger();
        CountDownLatch sent = new CountDownLatch(100);
        doAnswer(invocation -> {
            int current = concurrent.incrementAndGet(); max.accumulateAndGet(current, Math::max);
            Thread.yield(); concurrent.decrementAndGet(); sent.countDown(); return null;
        }).when(socket).sendMessage(any());
        try (var workers = Executors.newFixedThreadPool(8)) {
            var outbound = new SessionOutbound(socket, JsonMapper.builder().build(), workers, 262144, reason -> { throw new AssertionError(reason); });
            for (int index = 0; index < 100; index++) {
                int seq = index; workers.submit(() -> outbound.enqueue(Map.of("seq", seq), false, 1000));
            }
            assertThat(sent.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(max).hasValue(1);
        }
    }
}
