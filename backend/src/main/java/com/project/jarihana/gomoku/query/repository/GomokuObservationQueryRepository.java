package com.project.jarihana.gomoku.query.repository;

import com.project.jarihana.gomoku.domain.GomokuObservation;
import com.project.jarihana.gomoku.query.repository.dto.GomokuSpectatorCountProjection;
import com.project.jarihana.gomoku.query.repository.dto.GomokuSpectatorProjection;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public interface GomokuObservationQueryRepository extends Repository<GomokuObservation, Long> {
    boolean existsByRoomIdAndMemberIdAndParticipationIdAndLeftAtIsNull(long roomId, long memberId, UUID participationId);

    @Query("select o.participationId from GomokuObservation o where o.roomId=:roomId and o.leftAt is null and o.participationId in :candidates")
    Set<UUID> findActiveParticipations(long roomId, Collection<UUID> candidates);

    @Query(value = """
            select o.room_id as roomId, count(distinct o.member_id) as spectatorCount
            from gomoku_observation o
            join gomoku_observer_connection c on c.observation_id=o.id and c.expires_at>:now
            join gomoku_room r on r.id=o.room_id
            where o.room_id in (:roomIds) and o.left_at is null and r.visibility='PUBLIC' and r.status<>'CLOSED'
                and o.member_id<>r.host_member_id and o.member_id<>coalesce(r.guest_member_id,0)
            group by o.room_id
            """, nativeQuery = true)
    List<GomokuSpectatorCountProjection> countSpectators(Collection<Long> roomIds, LocalDateTime now);

    @Query(value = """
            select distinct o.member_id as memberId, m.crew_name as name, m.github_id as githubId
            from gomoku_observation o
            join gomoku_observer_connection c on c.observation_id=o.id and c.expires_at>:now
            join gomoku_room r on r.id=o.room_id
            join member m on m.id=o.member_id
            where o.room_id=:roomId and o.left_at is null and r.visibility='PUBLIC' and r.status<>'CLOSED'
                and o.member_id<>r.host_member_id and o.member_id<>coalesce(r.guest_member_id,0)
            order by o.member_id
            """, nativeQuery = true)
    List<GomokuSpectatorProjection> findSpectators(long roomId, LocalDateTime now);
}
