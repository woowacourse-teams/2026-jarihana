package com.project.jarihana.rhythmbattle.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BattleRefereeTest {
    private static final long HOST = 1;
    private static final long GUEST = 2;

    @Test
    @DisplayName("둘 다 살아 있으면 판이 계속된다")
    void continuesWhileBothAreAlive() {
        // Given
        BattleProgress host = BattleProgress.alive(HOST, 40);
        BattleProgress guest = BattleProgress.alive(GUEST, 12);

        // When & Then
        assertThat(BattleReferee.judge(host, guest)).isEmpty();
    }

    @Test
    @DisplayName("한 사람이 탈락하면 상대의 계산이 그 곡 시각까지 살아 있는 것을 확인한 뒤 상대가 이긴다")
    void survivorWinsOnceItHasPlayedPastTheElimination() {
        // Given
        BattleProgress host = BattleProgress.out(HOST, BattleOutReason.ELIMINATED, 30, 30);

        // When & Then
        assertThat(BattleReferee.judge(host, BattleProgress.alive(GUEST, 29.5))).isEmpty();
        assertThat(BattleReferee.judge(host, BattleProgress.alive(GUEST, 30)))
                .contains(BattleOutcome.win(GUEST, BattleEndReason.ELIMINATED));
        assertThat(BattleReferee.judge(BattleProgress.alive(GUEST, 31), host))
                .contains(BattleOutcome.win(GUEST, BattleEndReason.ELIMINATED));
    }

    @Test
    @DisplayName("둘 다 탈락하면 곡 시각으로 나중에 탈락한 쪽이 이기고, 같은 시각이면 무승부다")
    void laterEliminationWins() {
        // Given
        BattleProgress early = BattleProgress.out(HOST, BattleOutReason.ELIMINATED, 20, 20);
        BattleProgress late = BattleProgress.out(GUEST, BattleOutReason.ELIMINATED, 25, 25);
        BattleProgress same = BattleProgress.out(GUEST, BattleOutReason.ELIMINATED, 20, 20);

        // When & Then
        assertThat(BattleReferee.judge(early, late)).contains(BattleOutcome.win(GUEST, BattleEndReason.ELIMINATED));
        assertThat(BattleReferee.judge(late, early)).contains(BattleOutcome.win(GUEST, BattleEndReason.ELIMINATED));
        assertThat(BattleReferee.judge(early, same)).contains(BattleOutcome.draw());
    }

    @Test
    @DisplayName("나가기, 화면 이탈, 연결 끊김, 시각 위반은 그 자리에서 진 것으로 하고 둘 다 그러면 무승부다")
    void forfeitLosesImmediately() {
        // Given
        BattleProgress left = BattleProgress.out(HOST, BattleOutReason.ABANDONED, 3, 3);
        BattleProgress stale = BattleProgress.out(GUEST, BattleOutReason.STALE, 1, 1);

        // When & Then
        assertThat(BattleReferee.judge(left, BattleProgress.alive(GUEST, 0)))
                .contains(BattleOutcome.win(GUEST, BattleEndReason.FORFEIT));
        assertThat(BattleReferee.judge(BattleProgress.out(HOST, BattleOutReason.ELIMINATED, 10, 10), stale))
                .contains(BattleOutcome.win(HOST, BattleEndReason.FORFEIT));
        assertThat(BattleReferee.judge(left, stale)).contains(BattleOutcome.draw());
    }
}
