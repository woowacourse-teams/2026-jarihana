package com.project.jarihana.chat.query.repository;

import com.project.jarihana.chat.domain.ChatMessage;
import com.project.jarihana.chat.query.repository.dto.ChatMessageProjection;

import jakarta.persistence.QueryHint;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ChatMessageQueryJpaRepository extends Repository<ChatMessage, Long> {
    @Query(
            """
            select new com.project.jarihana.chat.query.repository.dto.ChatMessageProjection(
                c.id, c.groupId, c.sequence, sender.id, sender.crewName,
                c.clientMessageId, c.content, c.createdAt)
            from ChatMessage c join c.sender sender
            where c.groupId = :groupId
              and (cast(:before as Long) is null or c.sequence < :before)
              and (cast(:after as Long) is null or c.sequence > :after)
            """)
    @QueryHints(@QueryHint(name = "jakarta.persistence.query.timeout", value = "10000"))
    List<ChatMessageProjection> findMessages(
            @Param("groupId") long groupId,
            @Param("before") Long before,
            @Param("after") Long after,
            Pageable pageable);

    @Query(
            """
            select new com.project.jarihana.chat.query.repository.dto.ChatMessageProjection(
                c.id, c.groupId, c.sequence, sender.id, sender.crewName,
                c.clientMessageId, c.content, c.createdAt)
            from ChatMessage c join c.sender sender
            where c.id = :id
            """)
    @QueryHints(@QueryHint(name = "jakarta.persistence.query.timeout", value = "10000"))
    Optional<ChatMessageProjection> findMessage(@Param("id") long id);

    @Query(
            """
            select member.id
            from GroupMember membership join membership.member member
            where membership.group.id = :groupId and member.withdrawnAt is null
            """)
    @QueryHints(@QueryHint(name = "jakarta.persistence.query.timeout", value = "10000"))
    List<Long> findMembers(@Param("groupId") long groupId);
}
