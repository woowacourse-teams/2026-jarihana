package com.project.jarihana.sparring.query.service;

import com.project.jarihana.sparring.query.service.dto.SparringAvatarPoolsResult;

import lombok.RequiredArgsConstructor;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class SparringAvatarPoolsCache {
    static final String CACHE_NAME = "sparringAvatarPools";

    private final SparringQueryService queryService;

    @Cacheable(cacheNames = CACHE_NAME, sync = true)
    public SparringAvatarPoolsResult get(long topicId) {
        return queryService.avatarPools(topicId);
    }
}
