package com.project.jarihana.rhythm.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.rhythm.command.controller.dto.RhythmBatchRequest;
import com.project.jarihana.rhythm.command.controller.dto.RhythmChallengeCreateRequest;
import com.project.jarihana.rhythm.command.controller.dto.RhythmChallengeResponse;
import com.project.jarihana.rhythm.command.service.RhythmChallengeCommandService;
import com.project.jarihana.rhythm.domain.RhythmChallenge;

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
@RequestMapping("/games/rhythm-harpoon/challenges")
@RequiredArgsConstructor
public class RhythmChallengeCommandController {
    private final RhythmChallengeCommandService commands;

    @PostMapping
    public ResponseEntity<ApiResponse<RhythmChallengeResponse>> createChallenge(
            @LoginMember long memberId, @Valid @RequestBody RhythmChallengeCreateRequest request) {
        RhythmChallenge challenge = commands.create(memberId, request.level(), request.scrollSpeed());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(RhythmChallengeResponse.from(challenge)));
    }

    @PostMapping("/{id}/start")
    public ResponseEntity<ApiResponse<RhythmChallengeResponse>> startChallenge(
            @PathVariable long id, @LoginMember long memberId) {
        return ResponseEntity.ok(ApiResponse.success(RhythmChallengeResponse.from(commands.start(memberId, id))));
    }

    @PostMapping("/{id}/batches")
    public ResponseEntity<ApiResponse<RhythmChallengeResponse>> submitBatch(
            @PathVariable long id, @LoginMember long memberId, @Valid @RequestBody RhythmBatchRequest request) {
        RhythmChallenge challenge = commands.submit(memberId, id, request.toCommand());
        return ResponseEntity.ok(ApiResponse.success(RhythmChallengeResponse.from(challenge)));
    }

    @PostMapping("/{id}/abandon")
    public ResponseEntity<ApiResponse<RhythmChallengeResponse>> abandonChallenge(
            @PathVariable long id, @LoginMember long memberId) {
        return ResponseEntity.ok(ApiResponse.success(RhythmChallengeResponse.from(commands.abandon(memberId, id))));
    }
}
