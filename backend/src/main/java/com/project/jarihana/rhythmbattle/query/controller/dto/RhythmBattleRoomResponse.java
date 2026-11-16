package com.project.jarihana.rhythmbattle.query.controller.dto;

import com.project.jarihana.rhythm.domain.RhythmLevel;
import com.project.jarihana.rhythmbattle.domain.BattleEndReason;
import com.project.jarihana.rhythmbattle.domain.BattleOutReason;
import com.project.jarihana.rhythmbattle.domain.BattleRoomStatus;
import com.project.jarihana.rhythmbattle.domain.BattleRunStatus;
import com.project.jarihana.rhythmbattle.domain.BattleVisibility;
import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleRoomResult;

import java.util.List;

/**
 * 대전 방의 현재 모습이다. serverNow와 startsAt은 epoch 밀리초이며, 클라이언트는 두 값의 차이로
 * 공통 시작 시각까지 남은 시간을 계산한다. runs는 지금 판의 두 사람 진행이다.
 */
public record RhythmBattleRoomResponse(
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
    public static RhythmBattleRoomResponse from(RhythmBattleRoomResult room) {
        return new RhythmBattleRoomResponse(room.id(), room.revision(), room.serverNow(), room.status(),
                room.visibility(), room.level(), room.chartVersion(), room.gameNumber(), room.seed(), room.startsAt(),
                Player.from(room.host()), room.guest() == null ? null : Player.from(room.guest()),
                room.winnerMemberId(), room.endReason(), room.runs().stream().map(Run::from).toList());
    }

    public record Player(long memberId, String name, String githubId, boolean ready, double scrollSpeed) {
        static Player from(RhythmBattleRoomResult.Player player) {
            return new Player(player.memberId(), player.name(), player.githubId(), player.ready(),
                    player.scrollSpeed());
        }
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
        static Run from(RhythmBattleRoomResult.Run run) {
            return new Run(run.memberId(), run.status(), run.outReason(), run.outAt(), run.playedUntil(),
                    run.lastSequence(), run.scrollSpeed(), run.score(), run.combo(), run.bestCombo(), run.lives(),
                    run.loopReached(), run.perfect(), run.hit(), run.enough(), run.uhoh(), run.poor(), run.miss());
        }
    }
}
