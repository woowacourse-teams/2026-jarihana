package com.project.jarihana.sparring.stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.project.jarihana.sparring.query.repository.SparringQueryRepository;
import com.project.jarihana.sparring.query.service.SparringStreamQueryService;
import com.project.jarihana.sparring.query.service.dto.SparringPostResult;
import com.project.jarihana.sparring.query.service.dto.SparringStreamResult;
import com.project.jarihana.sparring.stream.dto.SparringStreamResponse;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

class SparringStreamsTest {
    private SparringStreams streams;
    private SparringStreamQueryService queries;

    @BeforeEach
    void setUp() {
        var repository = mock(SparringQueryRepository.class);
        when(repository.revision(1L)).thenReturn(Optional.of(1L));
        queries = mock(SparringStreamQueryService.class);
        streams = new SparringStreams(repository, queries);
        ((ScheduledExecutorService) ReflectionTestUtils.getField(streams, "ticker")).shutdownNow();
    }

    @AfterEach
    void tearDown() {
        streams.close();
    }

    @Test
    @DisplayName("느린 연결이 전송 중이어도 뒤따른 추가 메시지 이벤트를 순서대로 모두 보낸다")
    void preservesUpdatesWhilePreviousSendIsBlocked() throws Exception {
        // Given
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var received = new CountDownLatch(3);
        List<Long> revisions = new CopyOnWriteArrayList<>();
        SseEmitter emitter = mock(SseEmitter.class);
        doAnswer(
                        invocation -> {
                            SparringStreamResponse payload = payload(invocation.getArgument(0));
                            if (payload != null) {
                                if (payload.revision() == 1) {
                                    entered.countDown();
                                    assertTrue(release.await(5, TimeUnit.SECONDS));
                                }
                                revisions.add(payload.revision());
                                received.countDown();
                            }
                            return null;
                        })
                .when(emitter)
                .send(any(SseEmitter.SseEventBuilder.class));
        Object client = attach(emitter);
        // When
        try {
            offer(client, "snapshot", 1);
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            offer(client, "update", 2);
            offer(client, "update", 3);
        } finally {
            release.countDown();
        }
        // Then
        assertTrue(received.await(5, TimeUnit.SECONDS));
        assertEquals(List.of(1L, 2L, 3L), revisions);
    }

    @Test
    @DisplayName("조회 도중 합류한 연결은 다음 조회에서 스냅샷을 먼저 받고 기존 연결은 추가분을 받는다")
    void initializesSubscriberJoiningDuringPollBeforeUpdates() throws Exception {
        // Given
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var firstMessages = new CopyOnWriteArrayList<String>();
        var secondMessages = new CopyOnWriteArrayList<String>();
        attach(recordingEmitter(firstMessages));
        var post = new SparringPostResult(1, 1, "작성자", "CREW", "MINT", "내용", null, null);
        when(queries.poll(anyLong(), anyLong(), anyLong(), anyBoolean()))
                .thenAnswer(
                        invocation -> {
                            long previous = invocation.getArgument(1);
                            if (previous == -1) {
                                entered.countDown();
                                assertTrue(release.await(5, TimeUnit.SECONDS));
                                return new SparringStreamResult(1, 0, 0, 0, List.of(), List.of());
                            }
                            return new SparringStreamResult(
                                    2, 1, 0, 1, List.of(post), List.of(post));
                        });
        // When
        ReflectionTestUtils.invokeMethod(streams, "tick");
        try {
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            attach(recordingEmitter(secondMessages));
        } finally {
            release.countDown();
        }
        awaitPoll();
        ReflectionTestUtils.invokeMethod(streams, "tick");
        awaitPoll();
        awaitMessages(firstMessages, 2);
        awaitMessages(secondMessages, 1);
        // Then
        assertEquals(List.of("snapshot:1:0", "update:2:1"), firstMessages);
        assertEquals(List.of("snapshot:2:1"), secondMessages);
    }

    private SseEmitter recordingEmitter(List<String> messages) throws Exception {
        SseEmitter emitter = mock(SseEmitter.class);
        doAnswer(
                        invocation -> {
                            SseEmitter.SseEventBuilder event = invocation.getArgument(0);
                            SparringStreamResponse response = payload(event);
                            if (response != null) {
                                String header =
                                        event.build().iterator().next().getData().toString();
                                String name =
                                        header.contains("event:snapshot") ? "snapshot" : "update";
                                messages.add(
                                        name
                                                + ":"
                                                + response.revision()
                                                + ":"
                                                + response.posts().size());
                            }
                            return null;
                        })
                .when(emitter)
                .send(any(SseEmitter.SseEventBuilder.class));
        return emitter;
    }

    private SparringStreamResponse payload(SseEmitter.SseEventBuilder event) {
        return event.build().stream()
                .map(item -> item.getData())
                .filter(SparringStreamResponse.class::isInstance)
                .map(SparringStreamResponse.class::cast)
                .findFirst()
                .orElse(null);
    }

    private Object attach(SseEmitter replacement) {
        SseEmitter original = streams.subscribe(1L);
        Set<?> clients = (Set<?>) ReflectionTestUtils.getField(streams, "clients");
        Object client =
                clients.stream()
                        .filter(item -> ReflectionTestUtils.getField(item, "emitter") == original)
                        .findFirst()
                        .orElseThrow();
        ReflectionTestUtils.setField(client, "emitter", replacement);
        return client;
    }

    private void offer(Object client, String name, long revision) {
        ReflectionTestUtils.invokeMethod(
                client, "offer", name, new SparringStreamResponse(revision, 0, 0, 0, List.of()));
    }

    private void awaitPoll() throws InterruptedException {
        Map<?, ?> rooms = (Map<?, ?>) ReflectionTestUtils.getField(streams, "rooms");
        AtomicBoolean polling =
                (AtomicBoolean) ReflectionTestUtils.getField(rooms.get(1L), "polling");
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (polling.get() && System.nanoTime() < deadline) Thread.sleep(5);
        assertTrue(!polling.get());
    }

    private void awaitMessages(List<?> messages, int count) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (messages.size() < count && System.nanoTime() < deadline) Thread.sleep(5);
        assertEquals(count, messages.size());
    }
}
