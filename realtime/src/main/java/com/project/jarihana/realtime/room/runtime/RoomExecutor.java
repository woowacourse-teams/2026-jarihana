package com.project.jarihana.realtime.room.runtime;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.function.Consumer;

/** At most one drain is scheduled for a room; every task, including cleanup, uses this mailbox. */
public final class RoomExecutor {
    private final Executor pool;
    private final int capacity;
    private final Consumer<Throwable> failure;
    private final Deque<Runnable> queue = new ArrayDeque<>();
    private boolean scheduled;
    private boolean closed;

    public RoomExecutor(Executor pool, int capacity, Consumer<Throwable> failure) {
        this.pool = pool;
        this.capacity = capacity;
        this.failure = failure;
    }

    public synchronized boolean submit(Runnable task, boolean control) {
        int limit = control ? capacity + 64 : capacity;
        if (closed || queue.size() >= limit) return false;
        queue.addLast(task);
        if (!scheduled) {
            scheduled = true;
            try { pool.execute(this::drain); }
            catch (RejectedExecutionException error) {
                scheduled = false;
                queue.removeLastOccurrence(task);
                return false;
            }
        }
        return true;
    }

    private void drain() {
        for (int count = 0; count < 64; count++) {
            Runnable task;
            synchronized (this) {
                task = queue.pollFirst();
                if (task == null || closed) { scheduled = false; return; }
            }
            try { task.run(); }
            catch (RuntimeException error) { failure.accept(error); }
        }
        synchronized (this) {
            if (queue.isEmpty() || closed) { scheduled = false; return; }
            try { pool.execute(this::drain); }
            catch (RejectedExecutionException error) {
                scheduled = false;
                closed = true;
                queue.clear();
                failure.accept(error);
            }
        }
    }

    public synchronized int queued() { return queue.size(); }
    public synchronized void close() { closed = true; queue.clear(); }
}
