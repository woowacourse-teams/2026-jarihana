package com.project.jarihana.chat.command.repository;

import com.project.jarihana.chat.domain.ChatMessage;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Member;

import jakarta.persistence.EntityManager;

import lombok.RequiredArgsConstructor;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class JpaChatCommandRepository implements ChatCommandRepository {
    private final JdbcTemplate jdbc;
    private final ChatMessageCommandJpaRepository messages;
    private final ChatMemberCommandJpaRepository members;
    private final EntityManager entityManager;

    @Override
    public String lockGroup(long groupId) {
        return jdbc
                .query(
                        "select status from groups where id = ? for update",
                        (rs, row) -> rs.getString(1),
                        groupId)
                .stream()
                .findFirst()
                .orElseThrow(
                        () ->
                                new BusinessException(
                                        ErrorCode.GROUP_ACCESS_DENIED, "모임 채팅에 접근할 수 없습니다."));
    }

    @Override
    public void requireMember(long groupId, long memberId) {
        members.findActiveMember(groupId, memberId)
                .orElseThrow(
                        () ->
                                new BusinessException(
                                        ErrorCode.GROUP_ACCESS_DENIED, "모임 채팅에 접근할 수 없습니다."));
    }

    @Override
    public Optional<ChatMessage> findRequest(long groupId, long memberId, UUID requestId) {
        return messages.findRequest(groupId, memberId, requestId);
    }

    @Override
    public ChatMessage save(
            long groupId, long memberId, UUID requestId, String content, LocalDateTime now) {
        jdbc.update("insert into chat_room(group_id) values (?) on conflict do nothing", groupId);
        long sequence =
                jdbc.queryForObject(
                        "update chat_room set last_sequence = last_sequence + 1 where group_id = ?"
                                + " returning last_sequence",
                        Long.class,
                        groupId);
        ChatMessage message =
                messages.save(
                        ChatMessage.create(
                                groupId,
                                sequence,
                                entityManager.getReference(Member.class, memberId),
                                requestId,
                                content,
                                now));
        // Return the timestamp(6) value stored by PostgreSQL, including its rounding.
        entityManager.refresh(message);
        // Initialize the author while the service transaction is still open.
        message.author();
        return message;
    }

    @Override
    public long latestSequence(long groupId) {
        return jdbc
                .query(
                        "select last_sequence from chat_room where group_id = ?",
                        (rs, row) -> rs.getLong(1),
                        groupId)
                .stream()
                .findFirst()
                .orElse(0L);
    }

    @Override
    public long advanceRead(long groupId, long memberId, long sequence) {
        return jdbc.queryForObject(
                """
                insert into chat_read_state(group_id, member_id, last_read_sequence) values (?, ?, ?)
                on conflict (group_id, member_id) do update
                set last_read_sequence = greatest(chat_read_state.last_read_sequence, excluded.last_read_sequence)
                returning last_read_sequence
                """,
                Long.class,
                groupId,
                memberId,
                sequence);
    }

    @Override
    public long unreadCount(long groupId, long memberId, long sequence) {
        return messages.countByGroupIdAndSequenceGreaterThanAndSenderIdNot(
                groupId, sequence, memberId);
    }

    @Override
    public void initializeRead(long groupId, long memberId) {
        jdbc.update(
                """
                insert into chat_read_state(group_id, member_id, last_read_sequence)
                values (?, ?, coalesce((select last_sequence from chat_room where group_id = ?), 0))
                on conflict do nothing
                """,
                groupId,
                memberId,
                groupId);
    }

    @Override
    public void notifyEvent(String type, long groupId, Long memberId, Long messageId) {
        jdbc.queryForObject(
                """
                select pg_notify('jarihana_chat', json_build_object(
                'version', 1, 'type', cast(? as text), 'groupId', cast(? as bigint),
                'memberId', cast(? as bigint), 'messageId', cast(? as bigint))::text)
                """,
                String.class,
                type,
                groupId,
                memberId,
                messageId);
    }

    @Override
    public void notifyRemoval(long groupId) {
        members.findMemberIds(groupId)
                .forEach(memberId -> notifyEvent("ROOM_REMOVED", groupId, memberId, null));
    }
}
