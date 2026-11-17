package com.project.jarihana.rhythmbattle.domain;

import java.util.Optional;

/**
 * 두 사람의 진행으로 판이 끝났는지 정한다.
 *
 * <p>기권(나가기, 화면 이탈, 연결 끊김, 시각 위반)은 그 자리에서 진다. 라이프를 모두 잃은 탈락은 곡 시각으로 비교한다.
 * 상대가 그 시각까지 살아 있는 것을 서버 계산으로 확인해야 이기므로, 상대의 입력 묶음이 아직 오지 않았으면 기다린다.
 */
public final class BattleReferee {
    // 같은 묶음 경계에서 계산한 탈락 시각은 같은 값이 나오므로 아주 작은 차이만 같은 시각으로 본다.
    private static final double SAME_TIME = 0.000001;

    private BattleReferee() {
    }

    public static Optional<BattleOutcome> judge(BattleProgress first, BattleProgress second) {
        if (first.forfeited() && second.forfeited()) {
            return Optional.of(BattleOutcome.draw());
        }
        if (first.forfeited()) {
            return Optional.of(BattleOutcome.win(second.memberId(), BattleEndReason.FORFEIT));
        }
        if (second.forfeited()) {
            return Optional.of(BattleOutcome.win(first.memberId(), BattleEndReason.FORFEIT));
        }
        if (first.eliminated() && second.eliminated()) {
            return Optional.of(laterElimination(first, second));
        }
        if (first.eliminated()) {
            return survived(second, first);
        }
        if (second.eliminated()) {
            return survived(first, second);
        }
        return Optional.empty();
    }

    private static BattleOutcome laterElimination(BattleProgress first, BattleProgress second) {
        if (Math.abs(first.outAt() - second.outAt()) < SAME_TIME) {
            return BattleOutcome.draw();
        }
        long winner = first.outAt() > second.outAt() ? first.memberId() : second.memberId();
        return BattleOutcome.win(winner, BattleEndReason.ELIMINATED);
    }

    private static Optional<BattleOutcome> survived(BattleProgress alive, BattleProgress eliminated) {
        if (alive.playedUntil() < eliminated.outAt()) {
            return Optional.empty();
        }
        return Optional.of(BattleOutcome.win(alive.memberId(), BattleEndReason.ELIMINATED));
    }
}
