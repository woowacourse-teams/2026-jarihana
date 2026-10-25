package com.project.jarihana.chat.command.service.dto;

public record ReadChatResult(
        long groupId, long lastReadSequence, long latestSequence, long unreadCount) {}
