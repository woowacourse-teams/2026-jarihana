package com.project.jarihana.chat.query.controller;

import com.project.jarihana.chat.query.controller.dto.ChatHistoryResponse;
import com.project.jarihana.chat.query.controller.dto.ChatRoomsResponse;
import com.project.jarihana.chat.query.service.ChatQueryService;
import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;

import lombok.RequiredArgsConstructor;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class ChatQueryController {
    private final ChatQueryService service;

    @GetMapping("/chats")
    public ApiResponse<ChatRoomsResponse> findRooms(
            @LoginMember long memberId,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "") String query) {
        return ApiResponse.success(
                ChatRoomsResponse.from(service.rooms(memberId, cursor, size, query)));
    }

    @GetMapping("/groups/{groupId}/chat/messages")
    public ApiResponse<ChatHistoryResponse> findMessages(
            @LoginMember long memberId,
            @PathVariable long groupId,
            @RequestParam(required = false) Long beforeSequence,
            @RequestParam(required = false) Long afterSequence,
            @RequestParam(defaultValue = "50") int size) {
        return ApiResponse.success(
                ChatHistoryResponse.from(
                        service.history(memberId, groupId, beforeSequence, afterSequence, size)));
    }
}
