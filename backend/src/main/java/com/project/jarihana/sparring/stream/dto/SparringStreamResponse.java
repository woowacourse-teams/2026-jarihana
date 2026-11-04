package com.project.jarihana.sparring.stream.dto;

import com.project.jarihana.sparring.query.controller.dto.SparringPostResponse;
import com.project.jarihana.sparring.query.service.dto.SparringPostResult;
import com.project.jarihana.sparring.query.service.dto.SparringStreamResult;

import java.util.List;

public record SparringStreamResponse(
        long revision, long votesA, long votesB, long postCount, List<SparringPostResponse> posts) {
    public SparringStreamResponse {
        posts = List.copyOf(posts);
    }

    public static SparringStreamResponse from(SparringStreamResult result, boolean snapshot) {
        List<SparringPostResult> posts = snapshot ? result.latestPosts() : result.addedPosts();
        return new SparringStreamResponse(
                result.revision(),
                result.votesA(),
                result.votesB(),
                result.postCount(),
                posts.stream().map(SparringPostResponse::from).toList());
    }
}
