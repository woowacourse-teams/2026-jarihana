package com.project.jarihana.chat.command.repository;

import com.project.jarihana.chat.domain.ChatMessage;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

import lombok.RequiredArgsConstructor;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class JdbcChatCommandRepository implements ChatCommandRepository {
    private final JdbcTemplate jdbc;

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
        Boolean allowed =
                jdbc.queryForObject(
                        """
                        select exists(select 1 from group_member gm join member m on m.id = gm.member_id
                        where gm.group_id = ? and gm.member_id = ? and m.withdrawn_at is null)
                        """,
                        Boolean.class,
                        groupId,
                        memberId);
        if (!Boolean.TRUE.equals(allowed))
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, "모임 채팅에 접근할 수 없습니다.");
    }

    @Override
    public Optional<ChatMessage> findRequest(long groupId, long memberId, UUID requestId) {
        return jdbc
                .query(
                        """
                        select c.*, m.crew_name from chat_message c join member m on m.id = c.sender_id
                        where c.group_id = ? and c.sender_id = ? and c.client_message_id = ?
                        """,
                        (rs, row) ->
                                new ChatMessage(
                                        rs.getLong("id"),
                                        rs.getLong("group_id"),
                                        rs.getLong("sequence"),
                                        rs.getLong("sender_id"),
                                        rs.getString("crew_name"),
                                        rs.getObject("client_message_id", UUID.class),
                                        rs.getString("content"),
                                        rs.getObject("created_at", LocalDateTime.class)),
                        groupId,
                        memberId,
                        requestId)
                .stream()
                .findFirst();
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
        jdbc.update(
                """
                insert into chat_message(group_id, sequence, sender_id, client_message_id, content, created_at)
                values (?, ?, ?, ?, ?, ?)
                """,
                groupId,
                sequence,
                memberId,
                requestId,
                content,
                now);
        return findRequest(groupId, memberId, requestId).orElseThrow();
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
        return jdbc.queryForObject(
                "select count(*) from chat_message where group_id = ? and sequence > ? and"
                        + " sender_id <> ?",
                Long.class,
                groupId,
                sequence,
                memberId);
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
        jdbc.query(
                        "select member_id from group_member where group_id = ?",
                        (rs, row) -> rs.getLong(1),
                        groupId)
                .forEach(memberId -> notifyEvent("ROOM_REMOVED", groupId, memberId, null));
    }
}
