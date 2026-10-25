package com.project.jarihana.chat.query.repository;

import com.project.jarihana.chat.domain.ChatMessage;
import com.project.jarihana.chat.query.repository.dto.ChatRoomProjection;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import javax.sql.DataSource;

@Repository
public class JdbcChatQueryRepository implements ChatQueryRepository {
    private final JdbcTemplate jdbc;

    public JdbcChatQueryRepository(DataSource dataSource) {
        jdbc = new JdbcTemplate(dataSource);
        jdbc.setQueryTimeout(10);
    }

    public ChatRoomProjection getRoom(long memberId, long groupId) {
        return rooms(memberId, null, null, "", 1, groupId).stream()
                .findFirst()
                .orElseThrow(
                        () ->
                                new BusinessException(
                                        ErrorCode.GROUP_ACCESS_DENIED, "모임 채팅에 접근할 수 없습니다."));
    }

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
                  coalesce(c.created_at, g.created_at) as activity_at, c.*, m.crew_name
                from group_member gm join groups g on g.id = gm.group_id
                join member owner on owner.id = gm.member_id and owner.withdrawn_at is null
                left join chat_room r on r.group_id = g.id
                left join chat_read_state s on s.group_id = g.id and s.member_id = gm.member_id
                left join chat_message c on c.group_id = g.id and c.sequence = r.last_sequence
                left join member m on m.id = c.sender_id
                where gm.member_id = ? and (cast(? as bigint) is null or g.id = ?)
                  and position(lower(?) in lower(g.name)) > 0
                  and (cast(? as timestamp) is null or (coalesce(c.created_at,g.created_at),g.id) < (?,?))
                order by activity_at desc, g.id desc limit ?
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
                                rs.getObject("activity_at", LocalDateTime.class)),
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

    public List<ChatMessage> messages(long groupId, Long before, Long after, int size) {
        String direction = after == null ? "desc" : "asc";
        return jdbc.query(
                """
                select c.*, m.crew_name from chat_message c join member m on m.id = c.sender_id
                where c.group_id = ? and (cast(? as bigint) is null or c.sequence < ?)
                and (cast(? as bigint) is null or c.sequence > ?) order by c.sequence
                """
                        + direction
                        + " limit ?",
                (rs, row) -> message(rs),
                groupId,
                before,
                before,
                after,
                after,
                size);
    }

    public ChatMessage findMessage(long id) {
        return jdbc
                .query(
                        "select c.*, m.crew_name from chat_message c join member m on m.id ="
                                + " c.sender_id where c.id = ?",
                        (rs, row) -> message(rs),
                        id)
                .stream()
                .findFirst()
                .orElse(null);
    }

    public List<Long> members(long groupId) {
        return jdbc.query(
                """
                select gm.member_id from group_member gm join member m on m.id=gm.member_id
                where gm.group_id=? and m.withdrawn_at is null
                """,
                (rs, row) -> rs.getLong(1),
                groupId);
    }

    private static ChatMessage message(ResultSet rs) throws SQLException {
        return new ChatMessage(
                rs.getLong("id"),
                rs.getLong("group_id"),
                rs.getLong("sequence"),
                rs.getLong("sender_id"),
                rs.getString("crew_name"),
                rs.getObject("client_message_id", UUID.class),
                rs.getString("content"),
                rs.getObject("created_at", LocalDateTime.class));
    }
}
