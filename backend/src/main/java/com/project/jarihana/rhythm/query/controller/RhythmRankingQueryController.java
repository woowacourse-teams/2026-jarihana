package com.project.jarihana.rhythm.query.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.rhythm.query.controller.dto.RhythmRankingRequest;
import com.project.jarihana.rhythm.query.controller.dto.RhythmRankingResponse;
import com.project.jarihana.rhythm.query.service.RhythmRankingQueryService;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/games/rhythm-harpoon")
@RequiredArgsConstructor
public class RhythmRankingQueryController {
    private final RhythmRankingQueryService queries;

    @GetMapping("/rankings")
    public ResponseEntity<ApiResponse<RhythmRankingResponse>> findRankings(@LoginMember long memberId,
            @Valid @ModelAttribute RhythmRankingRequest request) {
        return ResponseEntity.ok(ApiResponse.success(RhythmRankingResponse.from(
                queries.ranking(memberId, request.level(), request.cursor(), request.size()))));
    }
}
