package com.project.jarihana.sparring.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.sparring.command.controller.dto.CreateSparringRequest;
import com.project.jarihana.sparring.command.controller.dto.SparringCommandResponse;
import com.project.jarihana.sparring.command.controller.dto.SparringPostRequest;
import com.project.jarihana.sparring.command.controller.dto.SparringVoteRequest;
import com.project.jarihana.sparring.command.service.SparringCommandService;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/sparrings")
@RequiredArgsConstructor
public class SparringCommandController {
    private final SparringCommandService service;

    @PostMapping
    public ResponseEntity<ApiResponse<SparringCommandResponse>> create(
            @LoginMember long memberId, @Valid @RequestBody CreateSparringRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(
                        ApiResponse.success(
                                SparringCommandResponse.from(
                                        service.create(memberId, request.toCommand()))));
    }

    @PostMapping("/{topicId}/votes")
    public ResponseEntity<Void> vote(
            @PathVariable long topicId,
            @LoginMember long memberId,
            @Valid @RequestBody SparringVoteRequest request) {
        service.vote(topicId, memberId, request.side());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{topicId}/posts")
    public ResponseEntity<ApiResponse<SparringCommandResponse>> post(
            @PathVariable long topicId,
            @LoginMember long memberId,
            @Valid @RequestBody SparringPostRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(
                        ApiResponse.success(
                                SparringCommandResponse.from(
                                        service.post(topicId, memberId, request.toCommand()))));
    }
}
