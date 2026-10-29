package com.project.jarihana.sparring.query.controller;

import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.sparring.query.controller.dto.SparringListRequest;
import com.project.jarihana.sparring.query.controller.dto.SparringPageResponse;
import com.project.jarihana.sparring.query.controller.dto.SparringPostResponse;
import com.project.jarihana.sparring.query.controller.dto.SparringPostsRequest;
import com.project.jarihana.sparring.query.controller.dto.SparringTopicResponse;
import com.project.jarihana.sparring.query.service.SparringQueryService;
import com.project.jarihana.sparring.query.service.dto.SparringPageResult;
import com.project.jarihana.sparring.query.service.dto.SparringPostResult;
import com.project.jarihana.sparring.query.service.dto.SparringTopicResult;

import lombok.RequiredArgsConstructor;

import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/sparrings")
@RequiredArgsConstructor
public class SparringQueryController {
    private final SparringQueryService service;
    private final LoginMemberReader memberReader;

    @GetMapping
    public ResponseEntity<ApiResponse<SparringPageResponse<SparringTopicResponse>>> topics(
            @Validated @ModelAttribute SparringListRequest request) {
        SparringPageResult<SparringTopicResult> result =
                service.topics(memberReader.currentMemberId().orElse(null), request.toQuery());
        return ResponseEntity.ok(
                ApiResponse.success(
                        new SparringPageResponse<>(
                                result.items().stream().map(SparringTopicResponse::from).toList(),
                                result.nextCursor(),
                                result.hasNext())));
    }

    @GetMapping("/{topicId}")
    public ResponseEntity<ApiResponse<SparringTopicResponse>> topic(@PathVariable long topicId) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        SparringTopicResponse.from(
                                service.topic(
                                        topicId, memberReader.currentMemberId().orElse(null)))));
    }

    @GetMapping("/{topicId}/posts")
    public ResponseEntity<ApiResponse<SparringPageResponse<SparringPostResponse>>> posts(
            @PathVariable long topicId, @Validated @ModelAttribute SparringPostsRequest request) {
        SparringPageResult<SparringPostResult> result =
                service.posts(
                        topicId, memberReader.currentMemberId().orElse(null), request.toQuery());
        return ResponseEntity.ok(
                ApiResponse.success(
                        new SparringPageResponse<>(
                                result.items().stream().map(SparringPostResponse::from).toList(),
                                result.nextCursor(),
                                result.hasNext())));
    }
}
