package com.project.jarihana.chat.command.repository;

import com.project.jarihana.chat.domain.ChatMessage;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface ChatMessageCommandJpaRepository extends Repository<ChatMessage, Long> {
    ChatMessage save(ChatMessage message);

    @Query(
            """
            select message from ChatMessage message join fetch message.sender
            where message.groupId = :groupId and message.sender.id = :memberId
              and message.clientMessageId = :requestId
            """)
    Optional<ChatMessage> findRequest(
            @Param("groupId") long groupId,
            @Param("memberId") long memberId,
            @Param("requestId") UUID requestId);

    long countByGroupIdAndSequenceGreaterThanAndSenderIdNot(
            long groupId, long sequence, long memberId);
}
