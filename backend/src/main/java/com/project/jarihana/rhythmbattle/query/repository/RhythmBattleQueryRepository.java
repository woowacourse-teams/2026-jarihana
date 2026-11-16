package com.project.jarihana.rhythmbattle.query.repository;

import com.project.jarihana.rhythmbattle.domain.RhythmBattleRoom;
import com.project.jarihana.rhythmbattle.query.repository.dto.RhythmBattleBatchProjection;
import com.project.jarihana.rhythmbattle.query.repository.dto.RhythmBattleChatProjection;
import com.project.jarihana.rhythmbattle.query.repository.dto.RhythmBattleRevisionProjection;
import com.project.jarihana.rhythmbattle.query.repository.dto.RhythmBattleRoomProjection;
import com.project.jarihana.rhythmbattle.query.repository.dto.RhythmBattleRunProjection;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface RhythmBattleQueryRepository extends Repository<RhythmBattleRoom, Long> {
    String SNAPSHOT_QUERY = """
            select
                r.id as id,
                r.hostMemberId as hostMemberId,
                r.hostName as hostName,
                host.githubId as hostGithubId,
                r.guestMemberId as guestMemberId,
                r.guestName as guestName,
                guest.githubId as guestGithubId,
                r.visibility as visibility,
                r.level as level,
                r.status as status,
                r.hostReady as hostReady,
                r.guestReady as guestReady,
                r.hostScrollSpeed as hostScrollSpeed,
                r.guestScrollSpeed as guestScrollSpeed,
                r.gameNumber as gameNumber,
                r.seed as seed,
                r.startsAt as startsAt,
                r.winnerMemberId as winnerMemberId,
                r.endReason as endReason,
                r.revision as revision,
                r.createdAt as createdAt
            from RhythmBattleRoom r
            left join Member host on host.id = r.hostMemberId
            left join Member guest on guest.id = r.guestMemberId
            """;

    @Query(SNAPSHOT_QUERY + " where r.id = :id")
    Optional<RhythmBattleRoomProjection> findProjectedById(long id);

    @Query(SNAPSHOT_QUERY + " where r.inviteHash = :hash")
    Optional<RhythmBattleRoomProjection> findProjectedByInviteHash(String hash);

    /**
     * 빈자리가 있는 공개 대기 방을 최근에 만든 순서로 보여 준다. 오래 활동이 없는 방은 곧 닫히므로 뺀다.
     */
    @Query(SNAPSHOT_QUERY + """
             where r.visibility = com.project.jarihana.rhythmbattle.domain.BattleVisibility.PUBLIC
                and r.status = com.project.jarihana.rhythmbattle.domain.BattleRoomStatus.WAITING
                and r.guestMemberId is null and r.touchedAt > :idle
                and (r.createdAt < :before or (r.createdAt = :before and r.id < :beforeId))
            order by r.createdAt desc, r.id desc
            """)
    List<RhythmBattleRoomProjection> findLobby(LocalDateTime idle, LocalDateTime before, long beforeId,
            Pageable page);

    @Query("""
            select run.memberId as memberId, run.status as status, run.outReason as outReason, run.outAt as outAt,
                run.playedUntil as playedUntil, run.lastSequence as lastSequence, run.scrollSpeed as scrollSpeed,
                run.score as score, run.combo as combo, run.bestCombo as bestCombo, run.lives as lives,
                run.loopReached as loopReached, run.perfectCount as perfectCount, run.hitCount as hitCount,
                run.enoughCount as enoughCount, run.uhohCount as uhohCount, run.poorCount as poorCount,
                run.missCount as missCount
            from RhythmBattleRun run
            where run.roomId = :roomId and run.gameNumber = :gameNumber
            order by run.id
            """)
    List<RhythmBattleRunProjection> findRuns(long roomId, int gameNumber);

    /**
     * 실시간 연결이 구독 중인 방들의 판 revision과 마지막 채팅 번호를 한 번에 확인한다. 채팅은 revision을 올리지 않는다.
     */
    @Query("""
            select r.id as id, r.revision as revision,
                (select coalesce(max(m.id), 0) from RhythmBattleChatMessage m where m.roomId = r.id) as latestChatId
            from RhythmBattleRoom r where r.id in :ids
            """)
    List<RhythmBattleRevisionProjection> findRevisions(Collection<Long> ids);

    @Query("select s.roomId from RhythmBattleSeat s where s.id = :memberId")
    Optional<Long> findCurrentRoomId(long memberId);

    @Query("select s.chatAfterId from RhythmBattleSeat s where s.id = :memberId and s.roomId = :roomId")
    Optional<Long> findChatAfterId(long memberId, long roomId);

    /**
     * 지금 판에서 받은 입력 묶음 중 afterId 다음 것을 받은 순서대로 돌려준다. 상대 화면에 판을 다시 그릴 때 쓴다.
     */
    @Query("""
            select b.id as id, run.memberId as memberId, b.sequence as sequence, b.playedUntil as playedUntil,
                b.inputs as inputs
            from RhythmBattleBatch b join RhythmBattleRun run on run.id = b.runId
            where run.roomId = :roomId and run.gameNumber = :gameNumber and b.id > :afterId
            order by b.id
            """)
    List<RhythmBattleBatchProjection> findBatchesAfter(long roomId, int gameNumber, long afterId, Pageable page);

    @Query("""
            select m.id as id, m.roomId as roomId, m.memberId as memberId, m.senderName as senderName, m.body as body,
                m.clientMessageId as clientMessageId, m.createdAt as createdAt
            from RhythmBattleChatMessage m
            where m.roomId = :roomId and m.id > :afterId
            order by m.id
            """)
    List<RhythmBattleChatProjection> findChatsAfter(long roomId, long afterId, Pageable page);

    @Query("select coalesce(max(m.id), 0) from RhythmBattleChatMessage m where m.roomId = :roomId")
    long findLatestChatId(long roomId);
}
