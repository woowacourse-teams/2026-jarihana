package com.project.jarihana.sparring.stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
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
        ((ScheduledExecutorService) ReflectionTestUtils.getField(streams, "reconciliation")).shutdownNow();
    }

    @AfterEach
    void tearDown() {
        streams.close();
    }

    @Test
    @DisplayName("기존 500개 상한을 넘어도 새 SSE 구독을 허용한다")
    void acceptsSubscriptionsBeyondPreviousLimit() {
        // Given
        for (int i = 0; i < 500; i++) streams.subscribe(1L);
        // When
        SseEmitter emitter = streams.subscribe(1L);
        // Then
        assertEquals(120_000L, emitter.getTimeout());
        Set<?> clients = (Set<?>) ReflectionTestUtils.getField(streams, "clients");
        assertEquals(501, clients.size());
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
        var post = new SparringPostResult(1, 1, "작성자", "CREW", "MINT", "내용", null, null, null);
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

    @Test
    @DisplayName("구독자 없는 방과 변경 없는 방은 정기 작업에서 조회하지 않는다")
    void skipsInactiveAndUnchangedRooms() throws Exception {
        // Given
        streams.markChanged(2L);
        ReflectionTestUtils.invokeMethod(streams, "tick");
        verifyNoInteractions(queries);
        var messages = new CopyOnWriteArrayList<String>();
        attach(recordingEmitter(messages));
        when(queries.poll(anyLong(), anyLong(), anyLong(), anyBoolean()))
                .thenReturn(new SparringStreamResult(1, 0, 0, 0, List.of(), List.of()));
        ReflectionTestUtils.invokeMethod(streams, "tick");
        awaitMessages(messages, 1);
        awaitPoll();

        // When
        streams.markChanged(2L);
        ReflectionTestUtils.invokeMethod(streams, "tick");
        awaitPoll();

        // Then
        verify(queries).poll(anyLong(), anyLong(), anyLong(), anyBoolean());
        assertEquals(List.of("snapshot:1:0"), messages);
    }

    @Test
    @DisplayName("수신 알림을 정기 작업 대기 없이 조회하여 SSE로 보내고 비활성 방은 건너뛴다")
    void deliversNotificationWithoutWaitingForTick() throws Exception {
        // Given
        var messages = new CopyOnWriteArrayList<String>();
        attach(recordingEmitter(messages));
        when(queries.poll(anyLong(), anyLong(), anyLong(), anyBoolean()))
                .thenReturn(new SparringStreamResult(1, 0, 0, 0, List.of(), List.of()));

        // When
        streams.markChanged(2L);
        verifyNoInteractions(queries);
        streams.markChanged(1L);

        // Then
        awaitMessages(messages, 1);
        awaitPoll();
        verify(queries).poll(1L, -1L, 0L, true);
        assertEquals(List.of("snapshot:1:0"), messages);
    }

    @Test
    @DisplayName("즉시 전송 조회 중 들어온 알림은 병합한 뒤 같은 방을 순서대로 다시 조회한다")
    void drainsSignalsArrivingDuringImmediateQuery() throws Exception {
        // Given
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var messages = new CopyOnWriteArrayList<String>();
        attach(recordingEmitter(messages));
        when(queries.poll(anyLong(), anyLong(), anyLong(), anyBoolean()))
                .thenAnswer(invocation -> {
                    entered.countDown();
                    assertTrue(release.await(5, TimeUnit.SECONDS));
                    return new SparringStreamResult(1, 0, 0, 0, List.of(), List.of());
                })
                .thenReturn(new SparringStreamResult(2, 0, 0, 0, List.of(), List.of()));

        // When
        streams.markChanged(1L);
        try {
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            streams.markChanged(1L);
            streams.markChanged(1L);
            verify(queries).poll(anyLong(), anyLong(), anyLong(), anyBoolean());
        } finally {
            release.countDown();
        }

        // Then
        awaitMessages(messages, 2);
        awaitPoll();
        verify(queries).poll(1L, -1L, 0L, true);
        verify(queries).poll(1L, 1L, 0L, false);
        assertEquals(List.of("snapshot:1:0", "update:2:0"), messages);
    }

    @Test
    @DisplayName("LISTEN 재연결 뒤 정기 작업 대기 없이 활성 방을 다시 조회한다")
    void recoversImmediatelyAfterReconnect() throws Exception {
        // Given
        var messages = new CopyOnWriteArrayList<String>();
        attach(recordingEmitter(messages));
        when(queries.poll(anyLong(), anyLong(), anyLong(), anyBoolean()))
                .thenReturn(new SparringStreamResult(1, 0, 0, 0, List.of(), List.of()));

        // When
        streams.markAllChanged();

        // Then
        awaitMessages(messages, 1);
        assertEquals(List.of("snapshot:1:0"), messages);
    }

    @Test
    @DisplayName("보완 조회로 발견한 변경도 추가 대기 없이 전달한다")
    void deliversReconciledChangesWithoutTick() throws Exception {
        // Given
        var messages = new CopyOnWriteArrayList<String>();
        attach(recordingEmitter(messages));
        when(queries.poll(anyLong(), anyLong(), anyLong(), anyBoolean()))
                .thenReturn(new SparringStreamResult(1, 0, 0, 0, List.of(), List.of()))
                .thenReturn(new SparringStreamResult(2, 0, 0, 0, List.of(), List.of()));
        streams.markChanged(1L);
        awaitMessages(messages, 1);
        awaitPoll();
        var repository = (SparringQueryRepository) ReflectionTestUtils.getField(streams, "repository");
        var revision = mock(SparringQueryRepository.TopicRevision.class);
        when(revision.getId()).thenReturn(1L);
        when(revision.getRevision()).thenReturn(2L);
        when(repository.revisions(List.of(1L))).thenReturn(List.of(revision));

        // When: the database revision advanced without a notification.
        ReflectionTestUtils.invokeMethod(streams, "reconcileRevisions");

        // Then
        awaitMessages(messages, 2);
        assertEquals(List.of("snapshot:1:0", "update:2:0"), messages);
    }

    @Test
    @DisplayName("활성 방이 없으면 보완 조회도 DB를 사용하지 않는다")
    void skipsReconciliationWithoutSubscribers() {
        // When
        ReflectionTestUtils.invokeMethod(streams, "reconcileRevisions");

        // Then
        verifyNoInteractions(queries);
        verifyNoInteractions(ReflectionTestUtils.getField(streams, "repository"));
    }

    @Test
    @DisplayName("보완 조회에서 revision이 같으면 추가 조회나 SSE 갱신을 하지 않는다")
    void skipsReconciledUnchangedRoom() throws Exception {
        // Given
        var messages = new CopyOnWriteArrayList<String>();
        attach(recordingEmitter(messages));
        when(queries.poll(anyLong(), anyLong(), anyLong(), anyBoolean()))
                .thenReturn(new SparringStreamResult(1, 0, 0, 0, List.of(), List.of()));
        streams.markChanged(1L);
        awaitMessages(messages, 1);
        awaitPoll();
        var repository = (SparringQueryRepository) ReflectionTestUtils.getField(streams, "repository");
        var revision = mock(SparringQueryRepository.TopicRevision.class);
        when(revision.getId()).thenReturn(1L);
        when(revision.getRevision()).thenReturn(1L);
        when(repository.revisions(List.of(1L))).thenReturn(List.of(revision));

        // When
        ReflectionTestUtils.invokeMethod(streams, "reconcileRevisions");

        // Then
        verify(queries).poll(anyLong(), anyLong(), anyLong(), anyBoolean());
        assertEquals(List.of("snapshot:1:0"), messages);
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
