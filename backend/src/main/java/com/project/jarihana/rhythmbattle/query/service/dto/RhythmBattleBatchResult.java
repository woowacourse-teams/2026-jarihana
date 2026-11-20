package com.project.jarihana.rhythmbattle.query.service.dto;

import com.project.jarihana.rhythm.domain.RhythmInput;
import com.project.jarihana.rhythmbattle.domain.RhythmBattleBatch;
import com.project.jarihana.rhythmbattle.query.repository.dto.RhythmBattleBatchProjection;

import java.util.List;

/**
 * 한 사람이 보낸 입력 묶음이다. 상대 화면은 같은 시드의 엔진에 이 입력을 넣어 판을 다시 그린다.
 */
public record RhythmBattleBatchResult(long id, long memberId, int sequence, double playedUntil,
        List<RhythmInput> inputs) {
    public RhythmBattleBatchResult {
        inputs = List.copyOf(inputs);
    }

    public static RhythmBattleBatchResult from(RhythmBattleBatchProjection batch) {
        return new RhythmBattleBatchResult(batch.getId(), batch.getMemberId(), batch.getSequence(),
                batch.getPlayedUntil(), RhythmBattleBatch.decode(batch.getInputs()));
    }
}
