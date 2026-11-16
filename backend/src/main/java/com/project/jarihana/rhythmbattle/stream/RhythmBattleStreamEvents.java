package com.project.jarihana.rhythmbattle.stream;

import com.project.jarihana.rhythmbattle.query.controller.dto.RhythmBattleChatHistoryResponse;
import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleBatchResult;
import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleChatResult;

import java.util.List;

/**
 * 실시간 연결로 보내는 이벤트의 본문이다. batches의 inputs는 [방향 순번, 곡 시각] 쌍의 목록이다.
 */
final class RhythmBattleStreamEvents {
    private RhythmBattleStreamEvents() {
    }

    record Batches(int gameNumber, List<Batch> items) {
        static Batches of(int gameNumber, List<RhythmBattleBatchResult> batches) {
            return new Batches(gameNumber, batches.stream().map(Batch::from).toList());
        }
    }

    record Batch(long id, long memberId, int sequence, double playedUntil, List<List<Number>> inputs) {
        static Batch from(RhythmBattleBatchResult batch) {
            return new Batch(batch.id(), batch.memberId(), batch.sequence(), batch.playedUntil(),
                    batch.inputs().stream()
                            .map(input -> List.<Number>of(input.lane().ordinal(), input.at()))
                            .toList());
        }
    }

    record Chat(List<RhythmBattleChatHistoryResponse.Item> items) {
        static Chat of(List<RhythmBattleChatResult> messages) {
            return new Chat(messages.stream().map(RhythmBattleChatHistoryResponse.Item::from).toList());
        }
    }
}
