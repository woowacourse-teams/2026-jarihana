package com.project.jarihana.gomoku.query.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.gomoku.query.controller.dto.GomokuChatHistoryRequest;
import com.project.jarihana.gomoku.query.controller.dto.GomokuChatHistoryResponse;
import com.project.jarihana.gomoku.query.service.GomokuChatQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class GomokuChatQueryController {
    private final GomokuChatQueryService service;

    @GetMapping("/games/gomoku/rooms/{roomId}/chat/messages")
    public ResponseEntity<ApiResponse<GomokuChatHistoryResponse>> findMessages(@PathVariable long roomId,
            @LoginMember long memberId, @Validated @ModelAttribute GomokuChatHistoryRequest request) {
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(ApiResponse.success(GomokuChatHistoryResponse.from(service.history(roomId, memberId,
                        request.participationId(), request.beforeSequence(), request.afterSequence(), request.pageSize()))));
    }
}
