package com.project.jarihana.chat.command.controller;

import com.project.jarihana.chat.command.controller.dto.ChatMessageResponse;
import com.project.jarihana.chat.command.controller.dto.ReadChatRequest;
import com.project.jarihana.chat.command.controller.dto.ReadChatResponse;
import com.project.jarihana.chat.command.controller.dto.SendChatRequest;
import com.project.jarihana.chat.command.service.ChatCommandService;
import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.common.response.ApiResponse;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/groups/{groupId}/chat")
@RequiredArgsConstructor
public class ChatCommandController {
    private final ChatCommandService service;

    @PostMapping("/messages")
    public ResponseEntity<ApiResponse<ChatMessageResponse>> sendMessage(
            @LoginMember long memberId,
            @PathVariable long groupId,
            @Valid @RequestBody SendChatRequest request) {
        var result =
                service.sendMessage(
                        memberId, groupId, request.clientMessageId(), request.content());
        return ResponseEntity.status(result.created() ? 201 : 200)
                .body(ApiResponse.success(ChatMessageResponse.from(result.message())));
    }

    @PutMapping("/read")
    public ApiResponse<ReadChatResponse> markRead(
            @LoginMember long memberId,
            @PathVariable long groupId,
            @Valid @RequestBody ReadChatRequest request) {
        long sequence;
        try {
            sequence = Long.parseLong(request.lastReadSequence());
        } catch (NumberFormatException invalid) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "읽음 순번을 확인해 주세요.");
        }
        return ApiResponse.success(
                ReadChatResponse.from(service.markRead(memberId, groupId, sequence)));
    }
}
