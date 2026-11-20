package com.project.jarihana.sparring.query.service;

import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Ticker;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.time.Duration;
import java.util.concurrent.Executor;

@Configuration(proxyBeanMethods = false)
@EnableCaching
class SparringAvatarPoolsCacheConfig {
    private static final int MAX_CACHED_TOPICS = 128;
    private static final Duration REFRESH_INTERVAL = Duration.ofSeconds(30);

    @Bean(defaultCandidate = false)
    ThreadPoolTaskExecutor sparringAvatarRefreshExecutor() {
        var executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(MAX_CACHED_TOPICS);
        executor.setThreadNamePrefix("sparring-avatar-refresh-");
        return executor;
    }

    @Bean
    CaffeineCacheManager sparringAvatarCacheManager(
            SparringQueryService queryService,
            @Qualifier("sparringAvatarRefreshExecutor") Executor executor) {
        return createCacheManager(queryService, executor, Ticker.systemTicker());
    }

    static CaffeineCacheManager createCacheManager(
            SparringQueryService queryService, Executor executor, Ticker ticker) {
        var manager = new CaffeineCacheManager(SparringAvatarPoolsCache.CACHE_NAME);
        manager.setAllowNullValues(false);
        manager.registerCustomCache(
                SparringAvatarPoolsCache.CACHE_NAME,
                Caffeine.newBuilder()
                        .maximumSize(MAX_CACHED_TOPICS)
                        .refreshAfterWrite(REFRESH_INTERVAL)
                        .executor(executor)
                        .ticker(ticker)
                        .build(key -> queryService.avatarPools((Long) key)));
        return manager;
    }
}
