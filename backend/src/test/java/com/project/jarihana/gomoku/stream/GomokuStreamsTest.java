package com.project.jarihana.gomoku.stream;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.timeout;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.project.jarihana.gomoku.domain.RoomStatus;
import com.project.jarihana.gomoku.query.service.GomokuQueryService;
import com.project.jarihana.gomoku.query.service.dto.GomokuRoomResult;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.ScheduledExecutorService;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

class GomokuStreamsTest {
    private GomokuStreams streams;
    private GomokuQueryService queries;
    private GomokuRoomResult initial;

    @BeforeEach
    void setUp() {
        queries = mock(GomokuQueryService.class);
        initial = mock(GomokuRoomResult.class);
        when(initial.revision()).thenReturn(1L);
        when(initial.contains(anyLong())).thenReturn(true);
        when(initial.status()).thenReturn(RoomStatus.WAITING);
        when(queries.getRoom(anyLong(), anyLong())).thenReturn(initial);
        when(queries.loadSnapshot(anyLong())).thenReturn(initial);
        when(queries.findRevisions(any())).thenReturn(Map.of(1L, 1L));
        streams = new GomokuStreams(queries, Clock.fixed(Instant.ofEpochMilli(1000), ZoneOffset.UTC));
        ((ScheduledExecutorService) ReflectionTestUtils.getField(streams, "ticker")).shutdownNow();
        streams.start();
    }

    @AfterEach
    void tearDown() {
        streams.close();
    }

    @Test
    @DisplayName("변경 없는 방은 전체 판과 회원 정보를 다시 조회하지 않는다")
    void skipsFullSnapshotForUnchangedRoom() {
        // Given
        streams.subscribe(1L, 10L, 120000L);
        // When
        ReflectionTestUtils.invokeMethod(streams, "tick");
        // Then
        verify(queries, after(200).never()).loadSnapshot(anyLong());
    }

    @Test
    @DisplayName("같은 방의 두 연결은 변경 번호 조회와 상세 조회를 공유한다")
    void sharesRevisionAndChangedSnapshotAcrossClients() {
        // Given
        streams.subscribe(1L, 10L, 120000L);
        streams.subscribe(1L, 20L, 120000L);
        when(queries.findRevisions(Set.of(1L))).thenReturn(Map.of(1L, 2L));
        GomokuRoomResult changed = mock(GomokuRoomResult.class);
        when(changed.revision()).thenReturn(2L);
        when(changed.contains(anyLong())).thenReturn(true);
        when(queries.loadSnapshot(1L)).thenReturn(changed);
        // When
        ReflectionTestUtils.invokeMethod(streams, "tick");
        // Then
        verify(queries, timeout(1000)).loadSnapshot(1L);
        verify(queries, times(1)).findRevisions(Set.of(1L));
        verify(queries, after(100).times(1)).loadSnapshot(1L);
    }

    @Test
    @DisplayName("DB가 느려도 상세 조회는 최대 네 개이며 같은 방의 조회가 겹치지 않는다")
    void boundsSlowQueriesWithoutOverlappingRoomPolls() throws Exception {
        // Given
        for (long id = 1; id <= 6; id++) streams.subscribe(id, id, 120000L);
        when(queries.findRevisions(any())).thenReturn(Map.of(1L, 2L, 2L, 2L, 3L, 2L,
                4L, 2L, 5L, 2L, 6L, 2L));
        CountDownLatch entered = new CountDownLatch(4);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger active = new AtomicInteger();
        AtomicInteger maximum = new AtomicInteger();
        when(queries.loadSnapshot(anyLong())).thenAnswer(invocation -> {
            int count = active.incrementAndGet();
            maximum.accumulateAndGet(count, Math::max);
            entered.countDown();
            try { assertTrue(release.await(3, TimeUnit.SECONDS)); }
            finally { active.decrementAndGet(); }
            return initial;
        });
        // When
        try {
            ReflectionTestUtils.invokeMethod(streams, "tick");
            assertTrue(entered.await(2, TimeUnit.SECONDS));
            for (int index = 0; index < 5; index++) ReflectionTestUtils.invokeMethod(streams, "tick");
            // Then
            assertEquals(4, maximum.get());
            verify(queries, times(4)).loadSnapshot(anyLong());
        } finally { release.countDown(); }
    }

    @Test
    @DisplayName("변경 번호 묶음 조회가 실패해도 다음 tick에서 다시 조회할 수 있다")
    void recoversAfterBatchQueryFailure() {
        // Given
        streams.subscribe(1L, 10L, 120000L);
        when(queries.findRevisions(any())).thenThrow(new IllegalStateException("database unavailable"));
        // When
        ReflectionTestUtils.invokeMethod(streams, "tick");
        doReturn(Map.of(1L, 1L)).when(queries).findRevisions(any());
        streams.subscribe(1L, 10L, 120000L);
        ReflectionTestUtils.invokeMethod(streams, "tick");
        // Then
        verify(queries, times(2)).findRevisions(Set.of(1L));
        verify(queries, after(100).never()).loadSnapshot(anyLong());
    }


    @Test
    @DisplayName("묶음 조회 중 들어온 새 구독은 조회 대상 누락으로 종료하지 않는다")
    void keepsSubscriptionsAddedDuringBatchQuery() {
        // Given
        streams.subscribe(1L, 10L, 120000L);
        when(queries.findRevisions(Set.of(1L))).thenAnswer(invocation -> {
            streams.subscribe(2L, 20L, 120000L);
            return Map.of(1L, 1L);
        });
        // When
        ReflectionTestUtils.invokeMethod(streams, "tick");
        // Then
        Set<?> clients = (Set<?>) ReflectionTestUtils.getField(streams, "clients");
        assertEquals(2, clients.size());
        verify(queries, after(100).never()).loadSnapshot(anyLong());
    }

}
