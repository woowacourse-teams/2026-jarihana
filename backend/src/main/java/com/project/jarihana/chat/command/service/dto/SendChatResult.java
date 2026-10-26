package com.project.jarihana.chat.command.service.dto;

import com.project.jarihana.chat.domain.ChatMessage;

public record SendChatResult(ChatMessage message, boolean created) {}
