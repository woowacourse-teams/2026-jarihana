package com.project.jarihana.gomoku.query.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.gomoku.query.controller.dto.GomokuCurrentRoomResponse;
import com.project.jarihana.gomoku.query.controller.dto.GomokuListRequest;
import com.project.jarihana.gomoku.query.controller.dto.GomokuLobbyPageResponse;
import com.project.jarihana.gomoku.query.controller.dto.GomokuPageResponse;
import com.project.jarihana.gomoku.query.controller.dto.GomokuPreviewResponse;
import com.project.jarihana.gomoku.query.controller.dto.GomokuRoomResponse;
import com.project.jarihana.gomoku.query.service.GomokuQueryService;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/games/gomoku")
@RequiredArgsConstructor
public class GomokuQueryController {
    private final GomokuQueryService queries;

    @GetMapping(value = "/rooms", params = "view!=summary")
    public ResponseEntity<ApiResponse<GomokuPageResponse>> findRooms(
            @Valid @ModelAttribute GomokuListRequest request) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        GomokuPageResponse.from(
                                queries.waitingRooms(request.cursor(), request.size(), request.keyword()))));
    }

    @GetMapping(value = "/rooms", params = "view=summary")
    public ResponseEntity<ApiResponse<GomokuLobbyPageResponse>> findRoomSummaries(
            @Valid @ModelAttribute GomokuListRequest request) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        GomokuLobbyPageResponse.from(
                                queries.lobby(request.cursor(), request.size(), request.keyword()))));
    }

    @GetMapping("/rooms/me")
    public ResponseEntity<ApiResponse<GomokuCurrentRoomResponse>> findCurrentRoom(
            @LoginMember long memberId) {
        return ResponseEntity.ok(
                ApiResponse.success(new GomokuCurrentRoomResponse(queries.currentRoom(memberId))));
    }

    @GetMapping("/rooms/{id}")
    public ResponseEntity<ApiResponse<GomokuRoomResponse>> findRoom(
            @PathVariable long id, @LoginMember long memberId) {
        return ResponseEntity.ok(
                ApiResponse.success(GomokuRoomResponse.from(queries.getRoom(id, memberId))));
    }

    @GetMapping("/invitations/{token}")
    public ResponseEntity<ApiResponse<GomokuPreviewResponse>> findInvitation(
            @PathVariable String token) {
        return ResponseEntity.ok()
                .header("Cache-Control", "no-store")
                .body(ApiResponse.success(GomokuPreviewResponse.from(queries.preview(token))));
    }
}
