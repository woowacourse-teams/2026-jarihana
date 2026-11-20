package com.project.jarihana.gomoku.query.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.gomoku.query.controller.dto.GomokuHistoryListRequest;
import com.project.jarihana.gomoku.query.controller.dto.GomokuHistoryResponse;
import com.project.jarihana.gomoku.query.controller.dto.GomokuRankingResponse;
import com.project.jarihana.gomoku.query.controller.dto.GomokuStatisticsResponse;
import com.project.jarihana.gomoku.query.service.GomokuHistoryQueryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/games/gomoku")
@RequiredArgsConstructor
public class GomokuHistoryQueryController {
    private final GomokuHistoryQueryService queries;

    @GetMapping("/history/me/summary")
    public ResponseEntity<ApiResponse<GomokuStatisticsResponse>> findStatistics(@LoginMember long memberId) {
        return ResponseEntity.ok(ApiResponse.success(GomokuStatisticsResponse.from(queries.statistics(memberId))));
    }

    @GetMapping("/history/me")
    public ResponseEntity<ApiResponse<GomokuHistoryResponse>> findHistory(@LoginMember long memberId,
            @Valid @ModelAttribute GomokuHistoryListRequest request) {
        return ResponseEntity.ok(ApiResponse.success(GomokuHistoryResponse.from(queries.history(memberId, request.cursor(), request.size()))));
    }

    @GetMapping("/ranking")
    public ResponseEntity<ApiResponse<GomokuRankingResponse>> findRanking(@LoginMember long memberId,
            @Valid @ModelAttribute GomokuHistoryListRequest request) {
        return ResponseEntity.ok(ApiResponse.success(GomokuRankingResponse.from(queries.ranking(memberId, request.cursor(), request.size()))));
    }
}
