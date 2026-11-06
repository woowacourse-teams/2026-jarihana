package com.project.jarihana.gomoku.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.gomoku.command.controller.dto.SendGomokuChatRequest;
import com.project.jarihana.gomoku.command.service.GomokuChatCommandService;
import com.project.jarihana.gomoku.command.controller.dto.SendGomokuChatResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class GomokuChatCommandController {
    private final GomokuChatCommandService service;

    @PostMapping("/games/gomoku/rooms/{roomId}/chat/messages")
    public ResponseEntity<ApiResponse<SendGomokuChatResponse>> sendMessage(@PathVariable long roomId,
            @LoginMember long memberId, @Valid @RequestBody SendGomokuChatRequest request) {
        var result = service.send(roomId, memberId, request.participationId(), request.clientMessageId(), request.content());
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .header("Cache-Control", "no-store")
                .body(ApiResponse.success(SendGomokuChatResponse.from(result.message())));
    }
}
