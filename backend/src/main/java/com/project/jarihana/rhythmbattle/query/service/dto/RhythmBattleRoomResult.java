package com.project.jarihana.rhythmbattle.query.service.dto;

import com.project.jarihana.rhythm.domain.RhythmLevel;
import com.project.jarihana.rhythmbattle.domain.BattleEndReason;
import com.project.jarihana.rhythmbattle.domain.BattleOutReason;
import com.project.jarihana.rhythmbattle.domain.BattleRoomStatus;
import com.project.jarihana.rhythmbattle.domain.BattleRunStatus;
import com.project.jarihana.rhythmbattle.domain.BattleVisibility;
import com.project.jarihana.rhythmbattle.query.repository.dto.RhythmBattleRoomProjection;
import com.project.jarihana.rhythmbattle.query.repository.dto.RhythmBattleRunProjection;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

/**
 * 대전 방의 현재 모습이다. 시각은 클라이언트가 서버 시계에 맞춰 음악을 틀 수 있도록 epoch 밀리초로 준다.
 */
public record RhythmBattleRoomResult(
        long id,
        long revision,
        long serverNow,
        BattleRoomStatus status,
        BattleVisibility visibility,
        RhythmLevel level,
        String chartVersion,
        int gameNumber,
        int seed,
        Long startsAt,
        Player host,
        Player guest,
        Long winnerMemberId,
        BattleEndReason endReason,
        List<Run> runs
) {
    public RhythmBattleRoomResult {
        runs = List.copyOf(runs);
    }

    public static RhythmBattleRoomResult of(RhythmBattleRoomProjection room, String chartVersion,
            List<RhythmBattleRunProjection> runs, Clock clock) {
        Player guest = room.getGuestMemberId() == null ? null
                : new Player(room.getGuestMemberId(), room.getGuestName(), room.getGuestGithubId(),
                        room.getGuestReady(), room.getGuestScrollSpeed());
        return new RhythmBattleRoomResult(room.getId(), room.getRevision(), clock.millis(), room.getStatus(),
                room.getVisibility(), room.getLevel(), chartVersion, room.getGameNumber(), room.getSeed(),
                epochMillis(room.getStartsAt(), clock),
                new Player(room.getHostMemberId(), room.getHostName(), room.getHostGithubId(), room.getHostReady(),
                        room.getHostScrollSpeed()),
                guest, room.getWinnerMemberId(), room.getEndReason(), runs.stream().map(Run::from).toList());
    }

    private static Long epochMillis(LocalDateTime time, Clock clock) {
        return time == null ? null : time.atZone(clock.getZone()).toInstant().toEpochMilli();
    }

    public boolean contains(long memberId) {
        return host.memberId() == memberId || guest != null && guest.memberId() == memberId;
    }

    public RhythmBattleRoomResult withServerNow(long now) {
        return new RhythmBattleRoomResult(id, revision, now, status, visibility, level, chartVersion, gameNumber,
                seed, startsAt, host, guest, winnerMemberId, endReason, runs);
    }

    public record Player(long memberId, String name, String githubId, boolean ready, double scrollSpeed) {
    }

    public record Run(
            long memberId,
            BattleRunStatus status,
            BattleOutReason outReason,
            Double outAt,
            double playedUntil,
            int lastSequence,
            double scrollSpeed,
            long score,
            int combo,
            int bestCombo,
            int lives,
            int loopReached,
            int perfect,
            int hit,
            int enough,
            int uhoh,
            int poor,
            int miss
    ) {
        static Run from(RhythmBattleRunProjection run) {
            return new Run(run.getMemberId(), run.getStatus(), run.getOutReason(), run.getOutAt(),
                    run.getPlayedUntil(), run.getLastSequence(), run.getScrollSpeed(), run.getScore(), run.getCombo(),
                    run.getBestCombo(), run.getLives(), run.getLoopReached(), run.getPerfectCount(),
                    run.getHitCount(), run.getEnoughCount(), run.getUhohCount(), run.getPoorCount(),
                    run.getMissCount());
        }
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof RhythmBattleRoomResult that && id == that.id && revision == that.revision;
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, revision);
    }
}
