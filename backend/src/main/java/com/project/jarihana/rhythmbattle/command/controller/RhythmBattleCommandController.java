package com.project.jarihana.rhythmbattle.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.rhythmbattle.command.controller.dto.RhythmBattleBatchRequest;
import com.project.jarihana.rhythmbattle.command.controller.dto.RhythmBattleChatMessageResponse;
import com.project.jarihana.rhythmbattle.command.controller.dto.RhythmBattleChatRequest;
import com.project.jarihana.rhythmbattle.command.controller.dto.RhythmBattleCreateRequest;
import com.project.jarihana.rhythmbattle.command.controller.dto.RhythmBattleGameRequest;
import com.project.jarihana.rhythmbattle.command.controller.dto.RhythmBattleInviteResponse;
import com.project.jarihana.rhythmbattle.command.controller.dto.RhythmBattleJoinRequest;
import com.project.jarihana.rhythmbattle.command.controller.dto.RhythmBattleReadyRequest;
import com.project.jarihana.rhythmbattle.command.controller.dto.RhythmBattleRoomIdResponse;
import com.project.jarihana.rhythmbattle.command.controller.dto.RhythmBattleRunResponse;
import com.project.jarihana.rhythmbattle.command.service.RhythmBattleChatCommandService;
import com.project.jarihana.rhythmbattle.command.service.RhythmBattleCommandService;

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
@RequestMapping("/games/rhythm-battle/rooms")
@RequiredArgsConstructor
public class RhythmBattleCommandController {
    private final RhythmBattleCommandService commands;
    private final RhythmBattleChatCommandService chats;

    @PostMapping
    public ResponseEntity<ApiResponse<RhythmBattleRoomIdResponse>> createRoom(
            @LoginMember long memberId, @Valid @RequestBody RhythmBattleCreateRequest request) {
        long roomId = commands.create(memberId, request.visibility(), request.level());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(new RhythmBattleRoomIdResponse(roomId)));
    }

    @PostMapping("/{id}/join")
    public ResponseEntity<ApiResponse<RhythmBattleRoomIdResponse>> joinRoom(
            @PathVariable long id, @LoginMember long memberId, @Valid @RequestBody RhythmBattleJoinRequest request) {
        return roomId(commands.join(id, memberId, request.token()));
    }

    @PutMapping("/{id}/ready")
    public ResponseEntity<ApiResponse<RhythmBattleRoomIdResponse>> readyRoom(
            @PathVariable long id, @LoginMember long memberId, @Valid @RequestBody RhythmBattleReadyRequest request) {
        return roomId(commands.ready(id, memberId, request.ready(), request.gameNumber(), request.scrollSpeed()));
    }

    @PostMapping("/{id}/start")
    public ResponseEntity<ApiResponse<RhythmBattleRoomIdResponse>> startBattle(
            @PathVariable long id, @LoginMember long memberId, @Valid @RequestBody RhythmBattleGameRequest request) {
        return roomId(commands.start(id, memberId, request.gameNumber()));
    }

    @PostMapping("/{id}/batches")
    public ResponseEntity<ApiResponse<RhythmBattleRunResponse>> submitBatch(
            @PathVariable long id, @LoginMember long memberId, @Valid @RequestBody RhythmBattleBatchRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                RhythmBattleRunResponse.from(commands.submit(id, memberId, request.toCommand()))));
    }

    @PostMapping("/{id}/forfeit")
    public ResponseEntity<ApiResponse<RhythmBattleRunResponse>> forfeitBattle(
            @PathVariable long id, @LoginMember long memberId, @Valid @RequestBody RhythmBattleGameRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                RhythmBattleRunResponse.from(commands.forfeit(id, memberId, request.gameNumber()))));
    }

    @PostMapping("/{id}/leave")
    public ResponseEntity<ApiResponse<RhythmBattleRoomIdResponse>> leaveRoom(
            @PathVariable long id, @LoginMember long memberId) {
        return roomId(commands.leave(id, memberId));
    }

    @PostMapping("/{id}/invite")
    public ResponseEntity<ApiResponse<RhythmBattleInviteResponse>> inviteToRoom(
            @PathVariable long id, @LoginMember long memberId) {
        return ResponseEntity.ok(ApiResponse.success(new RhythmBattleInviteResponse(commands.invite(id, memberId))));
    }

    @PostMapping("/{id}/chat/messages")
    public ResponseEntity<ApiResponse<RhythmBattleChatMessageResponse>> sendChat(
            @PathVariable long id, @LoginMember long memberId, @Valid @RequestBody RhythmBattleChatRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(RhythmBattleChatMessageResponse.from(
                chats.send(id, memberId, request.clientMessageId(), request.body()))));
    }

    private ResponseEntity<ApiResponse<RhythmBattleRoomIdResponse>> roomId(long roomId) {
        return ResponseEntity.ok(ApiResponse.success(new RhythmBattleRoomIdResponse(roomId)));
    }
}
