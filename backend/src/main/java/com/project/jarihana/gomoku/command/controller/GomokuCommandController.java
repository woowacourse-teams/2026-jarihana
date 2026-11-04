package com.project.jarihana.gomoku.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.gomoku.command.controller.dto.GomokuCommandResponse;
import com.project.jarihana.gomoku.command.controller.dto.GomokuCreateRequest;
import com.project.jarihana.gomoku.command.controller.dto.GomokuInviteResponse;
import com.project.jarihana.gomoku.command.controller.dto.GomokuJoinRequest;
import com.project.jarihana.gomoku.command.controller.dto.GomokuMoveRequest;
import com.project.jarihana.gomoku.command.controller.dto.GomokuReadyRequest;
import com.project.jarihana.gomoku.command.controller.dto.GomokuResignRequest;
import com.project.jarihana.gomoku.command.controller.dto.GomokuStartRequest;
import com.project.jarihana.gomoku.command.service.GomokuCommandService;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/games/gomoku/rooms")
@RequiredArgsConstructor
public class GomokuCommandController {
    private final GomokuCommandService commands;

    @PostMapping
    public ResponseEntity<ApiResponse<GomokuCommandResponse>> createRoom(
            @LoginMember long memberId, @Valid @RequestBody GomokuCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(
                        ApiResponse.success(
                                new GomokuCommandResponse(
                                        commands.create(
                                                memberId, request.visibility(), request.rule()))));
    }

    @PostMapping("/{id}/join")
    public ResponseEntity<ApiResponse<GomokuCommandResponse>> joinRoom(
            @PathVariable long id,
            @LoginMember long memberId,
            @Valid @RequestBody GomokuJoinRequest request) {
        return response(commands.join(id, memberId, request.token()));
    }

    @PutMapping("/{id}/ready")
    public ResponseEntity<ApiResponse<GomokuCommandResponse>> readyRoom(
            @PathVariable long id,
            @LoginMember long memberId,
            @Valid @RequestBody GomokuReadyRequest request) {
        return response(commands.ready(id, memberId, request.ready(), request.gameNumber()));
    }

    @PostMapping("/{id}/start")
    public ResponseEntity<ApiResponse<GomokuCommandResponse>> startGame(
            @PathVariable long id,
            @LoginMember long memberId,
            @Valid @RequestBody GomokuStartRequest request) {
        return response(commands.start(id, memberId, request.gameNumber()));
    }

    @PostMapping("/{id}/moves")
    public ResponseEntity<ApiResponse<GomokuCommandResponse>> placeStone(
            @PathVariable long id,
            @LoginMember long memberId,
            @Valid @RequestBody GomokuMoveRequest request) {
        return response(commands.move(id, memberId, request.toCommand()));
    }

    @PostMapping("/{id}/resign")
    public ResponseEntity<ApiResponse<GomokuCommandResponse>> resignGame(
            @PathVariable long id,
            @LoginMember long memberId,
            @Valid @RequestBody GomokuResignRequest request) {
        return response(commands.resign(id, memberId, request.gameNumber()));
    }

    @PostMapping("/{id}/leave")
    public ResponseEntity<ApiResponse<GomokuCommandResponse>> leaveRoom(
            @PathVariable long id, @LoginMember long memberId) {
        return response(commands.leave(id, memberId));
    }

    @PostMapping("/{id}/invite")
    public ResponseEntity<ApiResponse<GomokuInviteResponse>> createInvitation(
            @PathVariable long id, @LoginMember long memberId) {
        return ResponseEntity.ok()
                .header("Cache-Control", "no-store")
                .body(ApiResponse.success(new GomokuInviteResponse(commands.invite(id, memberId))));
    }

    private ResponseEntity<ApiResponse<GomokuCommandResponse>> response(long id) {
        return ResponseEntity.ok(ApiResponse.success(new GomokuCommandResponse(id)));
    }
}
