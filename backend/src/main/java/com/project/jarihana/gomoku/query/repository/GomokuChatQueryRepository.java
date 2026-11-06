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

public interface GomokuChatQueryRepository extends Repository<GomokuChatMessage, Long> {
    String MESSAGE = """
            select m.id as id, m.sequence as sequence, m.senderId as senderId,
                m.clientMessageId as clientMessageId, m.author as author,
                m.content as content, m.createdAt as createdAt
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
            """, nativeQuery = true)
    List<GomokuChatSignalProjection> findSignals(long roomId);
}
