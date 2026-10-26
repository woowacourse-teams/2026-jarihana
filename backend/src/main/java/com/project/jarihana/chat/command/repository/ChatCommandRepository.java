package com.project.jarihana.chat.command.repository;

import com.project.jarihana.chat.domain.ChatMessage;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

public interface ChatCommandRepository {
    String lockGroup(long groupId);

    void requireMember(long groupId, long memberId);

    Optional<ChatMessage> findRequest(long groupId, long memberId, UUID requestId);

    ChatMessage save(
            long groupId, long memberId, UUID requestId, String content, LocalDateTime now);

    long latestSequence(long groupId);

    long advanceRead(long groupId, long memberId, long sequence);

    long unreadCount(long groupId, long memberId, long sequence);

    void initializeRead(long groupId, long memberId);

    void notifyEvent(String type, long groupId, Long memberId, Long messageId);

    void notifyRemoval(long groupId);
}
