package com.project.jarihana.sparring.query.service.dto;

import java.util.List;

public record SparringStreamResult(
        long revision,
        long votesA,
        long votesB,
        long postCount,
        List<SparringPostResult> latestPosts,
        List<SparringPostResult> addedPosts) {
    public SparringStreamResult {
        latestPosts = List.copyOf(latestPosts);
        addedPosts = List.copyOf(addedPosts);
    }
}
