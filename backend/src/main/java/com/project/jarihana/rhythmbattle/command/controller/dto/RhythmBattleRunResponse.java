package com.project.jarihana.rhythmbattle.command.controller.dto;

import com.project.jarihana.rhythmbattle.command.service.dto.RhythmBattleRunResult;
import com.project.jarihana.rhythmbattle.domain.BattleEndReason;
import com.project.jarihana.rhythmbattle.domain.BattleOutReason;
import com.project.jarihana.rhythmbattle.domain.BattleRoomStatus;
import com.project.jarihana.rhythmbattle.domain.BattleRunStatus;
import com.project.jarihana.rhythmbattle.domain.RhythmBattleRoom;
import com.project.jarihana.rhythmbattle.domain.RhythmBattleRun;

/**
 * 서버가 다시 계산한 내 판의 상태와 방의 결과다. 상대 진행은 실시간 연결로 받는다.
 */
public record RhythmBattleRunResponse(
        int gameNumber,
        BattleRunStatus status,
        BattleOutReason outReason,
        Double outAt,
        double playedUntil,
        long score,
        int combo,
        int lives,
        BattleRoomStatus roomStatus,
        Long winnerMemberId,
        BattleEndReason endReason
) {
    public static RhythmBattleRunResponse from(RhythmBattleRunResult result) {
        RhythmBattleRun run = result.run();
        RhythmBattleRoom room = result.room();
        boolean sameGame = room.getGameNumber() == run.getGameNumber();
        return new RhythmBattleRunResponse(run.getGameNumber(), run.getStatus(), run.getOutReason(), run.getOutAt(),
                run.getPlayedUntil(), run.getScore(), run.getCombo(), run.getLives(), room.getStatus(),
                sameGame ? room.getWinnerMemberId() : null, sameGame ? room.getEndReason() : null);
    }
}
