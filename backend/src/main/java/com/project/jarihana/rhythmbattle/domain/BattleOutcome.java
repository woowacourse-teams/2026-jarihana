package com.project.jarihana.rhythmbattle.domain;

/**
 * 끝난 판의 결과다. 무승부면 승자가 없다.
 */
public record BattleOutcome(Long winnerMemberId, BattleEndReason reason) {
    public static BattleOutcome win(long winnerMemberId, BattleEndReason reason) {
        return new BattleOutcome(winnerMemberId, reason);
    }

    public static BattleOutcome draw() {
        return new BattleOutcome(null, BattleEndReason.DRAW);
    }
}
