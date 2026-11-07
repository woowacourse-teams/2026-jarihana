package com.project.jarihana.gomoku.query.repository;

import com.project.jarihana.gomoku.domain.GomokuChatMessage;
import com.project.jarihana.gomoku.query.repository.dto.GomokuChatAccessProjection;
import com.project.jarihana.gomoku.query.repository.dto.GomokuChatMessageProjection;
import com.project.jarihana.gomoku.query.repository.dto.GomokuChatSignalProjection;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.time.LocalDateTime;

public interface GomokuChatQueryRepository extends Repository<GomokuChatMessage, Long> {
    String MESSAGE = """
            select m.id as id, m.sequence as sequence, m.senderId as senderId,
                m.clientMessageId as clientMessageId, m.author as author,
                m.content as content, m.createdAt as createdAt, m.senderRole as senderRole
            from GomokuChatMessage m where m.roomId=:roomId and m.sequence>:floor
            """;

    @Query(value = """
            select s.participation_id as participationId, s.chat_start_sequence as chatStartSequence,
                coalesce(c.last_sequence,0) as latestSequence, r.status as status, r.touched_at as touchedAt
            from gomoku_room r join gomoku_seat s on s.room_id=r.id
            left join gomoku_chat_room c on c.room_id=r.id
            where r.id=:roomId and s.member_id=:memberId
                and (r.host_member_id=:memberId or r.guest_member_id=:memberId)
            """, nativeQuery = true)
    Optional<GomokuChatAccessProjection> findAccess(long roomId, long memberId);

    @Query(value = """
            select o.participation_id as participationId, o.chat_start_sequence as chatStartSequence,
                coalesce(c.last_sequence,0) as latestSequence, r.status as status, r.touched_at as touchedAt
            from gomoku_observation o join gomoku_room r on r.id=o.room_id
            left join gomoku_chat_room c on c.room_id=r.id
            where o.room_id=:roomId and o.member_id=:memberId and o.participation_id=:participationId
                and o.left_at is null and r.visibility='PUBLIC'
            """, nativeQuery = true)
    Optional<GomokuChatAccessProjection> findObserverAccess(long roomId, long memberId, UUID participationId);

    @Query(MESSAGE + " and m.sequence<:before order by m.sequence desc")
    List<GomokuChatMessageProjection> findBefore(long roomId, long floor, long before, Pageable page);

    @Query(MESSAGE + " and m.sequence>:after order by m.sequence asc")
    List<GomokuChatMessageProjection> findAfter(long roomId, long floor, long after, Pageable page);

    @Query(value = """
            select s.member_id as memberId, s.participation_id as participationId,
                coalesce(c.last_sequence,0) as latestSequence
            from gomoku_seat s join gomoku_room r on r.id=s.room_id
            left join gomoku_chat_room c on c.room_id=s.room_id
            where s.room_id=:roomId and r.status<>'CLOSED'
                and (r.host_member_id=s.member_id or r.guest_member_id=s.member_id)
            union all
            select o.member_id as memberId, o.participation_id as participationId,
                coalesce(c.last_sequence,0) as latestSequence
            from gomoku_observation o join gomoku_room r on r.id=o.room_id
            left join gomoku_chat_room c on c.room_id=o.room_id
            where o.room_id=:roomId and o.left_at is null and r.visibility='PUBLIC' and r.status<>'CLOSED'
                and exists(select 1 from gomoku_observer_connection connection
                    where connection.observation_id=o.id and connection.expires_at>:now)
            """, nativeQuery = true)
    List<GomokuChatSignalProjection> findSignals(long roomId, LocalDateTime now);
}
