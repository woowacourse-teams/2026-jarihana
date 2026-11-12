package com.project.jarihana.sparring.query.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.project.jarihana.member.domain.AvatarAppearance;
import com.project.jarihana.sparring.query.service.dto.SparringAvatarPoolsResult;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.time.Duration;
import java.util.List;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;

@SpringJUnitConfig(SparringAvatarPoolsCacheTest.Config.class)
class SparringAvatarPoolsCacheTest {
    private static final SparringAvatarPoolsResult EMPTY_POOL =
            new SparringAvatarPoolsResult(List.of());
    private static final SparringAvatarPoolsResult POPULATED_POOL =
            new SparringAvatarPoolsResult(List.of(AvatarAppearance.basic()));

    @Autowired SparringAvatarPoolsCache cache;
    @Autowired SparringQueryService queryService;
    @Autowired AtomicLong ticker;
    @Autowired QueuedExecutor refreshExecutor;

    @Test
    @DisplayName("30초 지난 목록은 즉시 반환하며 요청이 몰려도 백그라운드에서 한 번만 갱신한다")
    void servesCachedListWhileRefreshingOnce() {
        // Given
        long topicId = 1L;
        when(queryService.avatarPools(topicId)).thenReturn(EMPTY_POOL, POPULATED_POOL);
        assertThat(cache.get(topicId)).isEqualTo(EMPTY_POOL);

        // When / Then
        ticker.addAndGet(Duration.ofSeconds(29).toNanos());
        assertThat(cache.get(topicId)).isEqualTo(EMPTY_POOL);
        refreshExecutor.runQueuedTasks();
        verify(queryService).avatarPools(topicId);

        ticker.addAndGet(Duration.ofSeconds(1).toNanos() + 1);
        for (int request = 0; request < 100; request++) {
            assertThat(cache.get(topicId)).isEqualTo(EMPTY_POOL);
        }
        verify(queryService).avatarPools(topicId);

        refreshExecutor.runQueuedTasks();
        assertThat(cache.get(topicId)).isEqualTo(POPULATED_POOL);
        verify(queryService, times(2)).avatarPools(topicId);
    }

    @Test
    @DisplayName("캐시에 없는 같은 토론의 동시 요청은 첫 조회 결과를 공유한다")
    void coalescesConcurrentColdLoads() throws Exception {
        // Given
        long topicId = 2L;
        var loadStarted = new CountDownLatch(1);
        var releaseLoad = new CountDownLatch(1);
        var secondStarted = new CountDownLatch(1);
        when(queryService.avatarPools(topicId)).thenAnswer(call -> {
            loadStarted.countDown();
            assertThat(releaseLoad.await(5, TimeUnit.SECONDS)).isTrue();
            return POPULATED_POOL;
        });

        try (var executor = Executors.newFixedThreadPool(2)) {
            try {
                // When
                var first = executor.submit(() -> cache.get(topicId));
                assertThat(loadStarted.await(2, TimeUnit.SECONDS)).isTrue();
                var second = executor.submit(() -> {
                    secondStarted.countDown();
                    return cache.get(topicId);
                });
                assertThat(secondStarted.await(2, TimeUnit.SECONDS)).isTrue();

                // Then
                assertThrows(TimeoutException.class, () -> second.get(100, TimeUnit.MILLISECONDS));
                releaseLoad.countDown();
                assertThat(first.get(2, TimeUnit.SECONDS)).isEqualTo(POPULATED_POOL);
                assertThat(second.get(2, TimeUnit.SECONDS)).isEqualTo(POPULATED_POOL);
                verify(queryService).avatarPools(topicId);
            } finally {
                releaseLoad.countDown();
            }
        }
    }

    @Configuration(proxyBeanMethods = false)
    @EnableCaching
    @Import(SparringAvatarPoolsCache.class)
    static class Config {
        @Bean
        SparringQueryService queryService() {
            return mock(SparringQueryService.class);
        }

        @Bean
        AtomicLong ticker() {
            return new AtomicLong();
        }

        @Bean
        QueuedExecutor refreshExecutor() {
            return new QueuedExecutor();
        }

        @Bean
        CaffeineCacheManager cacheManager(
                SparringQueryService queryService, QueuedExecutor executor, AtomicLong ticker) {
            return SparringAvatarPoolsCacheConfig.createCacheManager(queryService, executor, ticker::get);
        }
    }

    static class QueuedExecutor implements Executor {
        private final Queue<Runnable> tasks = new ConcurrentLinkedQueue<>();

        @Override
        public void execute(Runnable task) {
            tasks.add(task);
        }

        void runQueuedTasks() {
            Runnable task;
            while ((task = tasks.poll()) != null) {
                task.run();
            }
        }
    }
}
