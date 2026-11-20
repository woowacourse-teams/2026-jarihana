package com.project.jarihana.rhythmbattle.query.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.rhythmbattle.query.controller.dto.RhythmBattleChatHistoryResponse;
import com.project.jarihana.rhythmbattle.query.controller.dto.RhythmBattleCurrentRoomResponse;
import com.project.jarihana.rhythmbattle.query.controller.dto.RhythmBattleInvitationResponse;
import com.project.jarihana.rhythmbattle.query.controller.dto.RhythmBattleListRequest;
import com.project.jarihana.rhythmbattle.query.controller.dto.RhythmBattleLobbyResponse;
import com.project.jarihana.rhythmbattle.query.controller.dto.RhythmBattleRankingResponse;
import com.project.jarihana.rhythmbattle.query.controller.dto.RhythmBattleRoomResponse;
import com.project.jarihana.rhythmbattle.query.controller.dto.RhythmBattleSummaryResponse;
import com.project.jarihana.rhythmbattle.query.service.RhythmBattleQueryService;
import com.project.jarihana.rhythmbattle.query.service.RhythmBattleRankingQueryService;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/games/rhythm-battle")
@RequiredArgsConstructor
public class RhythmBattleQueryController {
    private final RhythmBattleQueryService queries;
    private final RhythmBattleRankingQueryService rankings;

    @GetMapping("/rooms")
    public ResponseEntity<ApiResponse<RhythmBattleLobbyResponse>> findRooms(
            @LoginMember long memberId, @Valid @ModelAttribute RhythmBattleListRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                RhythmBattleLobbyResponse.from(queries.findLobby(request.cursor(), request.size()))));
    }

    @GetMapping("/rooms/me")
    public ResponseEntity<ApiResponse<RhythmBattleCurrentRoomResponse>> findCurrentRoom(@LoginMember long memberId) {
        return ResponseEntity.ok(ApiResponse.success(
                new RhythmBattleCurrentRoomResponse(queries.findCurrentRoomId(memberId).orElse(null))));
    }

    @GetMapping("/rooms/{id}")
    public ResponseEntity<ApiResponse<RhythmBattleRoomResponse>> findRoom(
            @PathVariable long id, @LoginMember long memberId) {
        return ResponseEntity.ok(ApiResponse.success(RhythmBattleRoomResponse.from(queries.getRoom(id, memberId))));
    }

    @GetMapping("/invitations/{token}")
    public ResponseEntity<ApiResponse<RhythmBattleInvitationResponse>> findInvitation(
            @PathVariable String token, @LoginMember long memberId) {
        return ResponseEntity.ok(ApiResponse.success(RhythmBattleInvitationResponse.from(queries.getInvitation(token))));
    }

    @GetMapping("/rooms/{id}/chat/messages")
    public ResponseEntity<ApiResponse<RhythmBattleChatHistoryResponse>> findChatMessages(
            @PathVariable long id, @LoginMember long memberId) {
        return ResponseEntity.ok(ApiResponse.success(
                RhythmBattleChatHistoryResponse.from(queries.findChatHistory(id, memberId))));
    }

    @GetMapping("/ranking")
    public ResponseEntity<ApiResponse<RhythmBattleRankingResponse>> findRanking(
            @LoginMember long memberId, @Valid @ModelAttribute RhythmBattleListRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                RhythmBattleRankingResponse.from(rankings.findRanking(memberId, request.cursor(), request.size()))));
    }

    @GetMapping("/history/me/summary")
    public ResponseEntity<ApiResponse<RhythmBattleSummaryResponse>> findSummary(@LoginMember long memberId) {
        return ResponseEntity.ok(ApiResponse.success(RhythmBattleSummaryResponse.from(rankings.getSummary(memberId))));
    }
}
