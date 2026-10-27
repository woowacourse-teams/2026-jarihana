package com.project.jarihana.chat.query.repository;

import com.project.jarihana.chat.query.repository.dto.ChatMessageProjection;
import com.project.jarihana.chat.query.repository.dto.ChatRoomProjection;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import javax.sql.DataSource;

@Repository
public class JpaChatQueryRepository implements ChatQueryRepository {
    private final JdbcTemplate jdbc;
    private final ChatMessageQueryJpaRepository messages;

    public JpaChatQueryRepository(DataSource dataSource, ChatMessageQueryJpaRepository messages) {
        this.messages = messages;
        jdbc = new JdbcTemplate(dataSource);
        jdbc.setQueryTimeout(10);
    }

    @Override
    public ChatRoomProjection getRoom(long memberId, long groupId) {
        return rooms(memberId, null, null, "", 1, groupId).stream()
                .findFirst()
                .orElseThrow(
                        () ->
                                new BusinessException(
                                        ErrorCode.GROUP_ACCESS_DENIED, "모임 채팅에 접근할 수 없습니다."));
    }

    @Override
    public List<ChatRoomProjection> rooms(
            long memberId,
            LocalDateTime cursorTime,
            Long cursorId,
            String query,
            int size,
            Long groupId) {
        return jdbc.query(
                """
                select g.id as room_group_id, g.name, g.type, g.description, g.status, g.representative_image_key,
                  coalesce(r.last_sequence, 0) as latest_sequence,
                  coalesce(s.last_read_sequence, 0) as read_sequence,
                  (select count(*) from group_member gm2 where gm2.group_id = g.id) as member_count,
                  (select count(*) from chat_message u where u.group_id = g.id
                    and u.sequence > coalesce(s.last_read_sequence,0) and u.sender_id <> ?) as unread_count,
                  coalesce(c.created_at, g.created_at) as activity_at, g.created_at as room_created_at, c.*, m.crew_name, m.github_id
                from group_member gm join groups g on g.id = gm.group_id
                join member owner on owner.id = gm.member_id and owner.withdrawn_at is null
                left join chat_room r on r.group_id = g.id
                left join chat_read_state s on s.group_id = g.id and s.member_id = gm.member_id
                left join chat_message c on c.group_id = g.id and c.sequence = r.last_sequence
                left join member m on m.id = c.sender_id
                where gm.member_id = ? and (cast(? as bigint) is null or g.id = ?)
                  and position(lower(?) in lower(g.name)) > 0
                  and (cast(? as timestamp) is null or (g.created_at,g.id) < (?,?))
                order by g.created_at desc, g.id desc limit ?
                """,
                (rs, row) ->
                        new ChatRoomProjection(
                                rs.getLong("room_group_id"),
                                rs.getString("name"),
                                rs.getString("type"),
                                rs.getString("description"),
                                rs.getString("representative_image_key"),
                                rs.getLong("member_count"),
                                rs.getString("status"),
                                rs.getLong("latest_sequence"),
                                rs.getLong("read_sequence"),
                                rs.getLong("unread_count"),
                                rs.getObject("id") == null ? null : message(rs),
                                rs.getObject("activity_at", LocalDateTime.class),
                                rs.getObject("room_created_at", LocalDateTime.class)),
                memberId,
                memberId,
                groupId,
                groupId,
                query,
                cursorTime,
                cursorTime,
                cursorId,
                size);
    }

    @Override
    public List<ChatMessageProjection> messages(long groupId, Long before, Long after, int size) {
        Sort.Direction direction = after == null ? Sort.Direction.DESC : Sort.Direction.ASC;
        return messages.findMessages(
                groupId, before, after, PageRequest.of(0, size, Sort.by(direction, "sequence")));
    }

    @Override
    public ChatMessageProjection findMessage(long id) {
        return messages.findMessage(id).orElse(null);
    }

    @Override
    public List<Long> members(long groupId) {
        return messages.findMembers(groupId);
    }

    private static ChatMessageProjection message(ResultSet rs) throws SQLException {
        return new ChatMessageProjection(
                rs.getLong("id"),
                rs.getLong("group_id"),
                rs.getLong("sequence"),
                rs.getLong("sender_id"),
                rs.getString("crew_name"),
                rs.getString("github_id"),
                rs.getObject("client_message_id", UUID.class),
                rs.getString("content"),
                rs.getObject("created_at", LocalDateTime.class));
    }
}
