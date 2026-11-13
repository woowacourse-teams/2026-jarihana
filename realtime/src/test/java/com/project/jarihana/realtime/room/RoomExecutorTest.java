package com.project.jarihana.realtime.room;

import static org.assertj.core.api.Assertions.assertThat;

import com.project.jarihana.realtime.room.runtime.RoomExecutor;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class RoomExecutorTest {
    @Test
    void boundedMailboxReservesCleanupCapacity() {
        List<Runnable> scheduled = new ArrayList<>();
        RoomExecutor room = new RoomExecutor(scheduled::add, 8, error -> { throw new AssertionError(error); });
        for (int index = 0; index < 8; index++) assertThat(room.submit(() -> {}, false)).isTrue();
        assertThat(room.submit(() -> {}, false)).isFalse();
        assertThat(room.submit(() -> {}, true)).isTrue();
        assertThat(scheduled).hasSize(1);
        scheduled.getFirst().run();
        assertThat(room.queued()).isZero();
    }

    @Test
    void concurrentSubmissionsNeverMutateOneRoomConcurrently() throws Exception {
        try (var pool = Executors.newFixedThreadPool(8)) {
            AtomicInteger concurrent = new AtomicInteger(), max = new AtomicInteger();
            CountDownLatch completed = new CountDownLatch(1000);
            RoomExecutor room = new RoomExecutor(pool, 1024, error -> { throw new AssertionError(error); });
            for (int index = 0; index < 1000; index++) pool.submit(() -> room.submit(() -> {
                max.accumulateAndGet(concurrent.incrementAndGet(), Math::max);
                Thread.yield(); concurrent.decrementAndGet(); completed.countDown();
            }, false));
            assertThat(completed.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(max).hasValue(1);
        }
    }
}
