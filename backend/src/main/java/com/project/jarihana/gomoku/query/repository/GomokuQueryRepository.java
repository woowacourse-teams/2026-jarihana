package com.project.jarihana.gomoku.query.repository;

import com.project.jarihana.gomoku.domain.GomokuRoom;
import com.project.jarihana.gomoku.query.repository.dto.GomokuRevisionProjection;
import com.project.jarihana.gomoku.query.repository.dto.GomokuRoomProjection;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

public interface GomokuQueryRepository extends Repository<GomokuRoom, Long> {
    String SNAPSHOT_QUERY = """
            select
                r.id as id,
                r.hostMemberId as hostMemberId,
                r.hostName as hostName,
                r.guestMemberId as guestMemberId,
                r.guestName as guestName,
                r.visibility as visibility,
                r.rule as rule,
                r.status as status,
                r.hostReady as hostReady,
                r.guestReady as guestReady,
                r.gameNumber as gameNumber,
                r.blackMemberId as blackMemberId,
                r.board as board,
                r.ply as ply,
                r.lastX as lastX,
                r.lastY as lastY,
                r.winnerMemberId as winnerMemberId,
                r.endReason as endReason,
                r.revision as revision,
                r.createdAt as createdAt,
                r.turnDeadline as turnDeadline,
                host.githubId as hostGithubId,
                guest.githubId as guestGithubId
            from GomokuRoom r
            left join Member host on host.id = r.hostMemberId
            left join Member guest on guest.id = r.guestMemberId
            """;

    @Query("select r.id as id, r.revision as revision from GomokuRoom r where r.id in :ids")
    List<GomokuRevisionProjection> findRevisions(Set<Long> ids);

    @Query(SNAPSHOT_QUERY + " where r.id = :id")
    Optional<GomokuRoomProjection> findProjectedById(long id);

    @Query(SNAPSHOT_QUERY + " where r.inviteHash = :hash")
    Optional<GomokuRoomProjection> findProjectedByInviteHash(String hash);

    @Query(
            SNAPSHOT_QUERY
                + " where r.visibility=com.project.jarihana.gomoku.domain.RoomVisibility.PUBLIC and"
                + " ((r.status=com.project.jarihana.gomoku.domain.RoomStatus.WAITING and"
                + " r.guestMemberId is null and r.touchedAt>:idle) or"
                + " (r.status=com.project.jarihana.gomoku.domain.RoomStatus.PLAYING and"
                + " r.turnDeadline>:now))"
                + " and (:keyword='' or locate(lower(:keyword),lower(r.hostName))>0)"
                + " and (r.createdAt<:before or"
                + " (r.createdAt=:before and r.id<:beforeId)) order by r.createdAt desc,r.id desc")
    List<GomokuRoomProjection> lobby(
            LocalDateTime now,
            LocalDateTime idle,
            LocalDateTime before,
            long beforeId,
            String keyword,
            Pageable page);

    @Query("select s.roomId from GomokuSeat s where s.id=:memberId")
    Optional<Long> currentRoom(long memberId);
}
