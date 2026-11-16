package com.project.jarihana.rhythmbattle.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.rhythm.domain.RhythmLevel;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

class RhythmBattleRoomTest {
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 11, 16, 12, 0);
    private static final long HOST = 1;
    private static final long GUEST = 2;

    @Test
    @DisplayName("방장이 정한 난이도로 방을 만들고, 상대가 들어온 뒤 둘 다 준비해야 방장이 시작할 수 있다")
    void startsOnlyWhenBothAreReady() {
        // Given
        RhythmBattleRoom room = RhythmBattleRoom.create(HOST, "가을", BattleVisibility.PUBLIC, RhythmLevel.HARD, NOW);

        // When & Then
        assertThat(room.getStatus()).isEqualTo(BattleRoomStatus.WAITING);
        assertThat(room.getLevel()).isEqualTo(RhythmLevel.HARD);
        assertThatThrownBy(() -> room.ready(HOST, true, 1, NOW)).isInstanceOf(BusinessException.class);
        RhythmBattleRoom joined = room.join(GUEST, "겨울", NOW);
        RhythmBattleRoom hostReady = joined.ready(HOST, true, 1.5, NOW);
        assertThatThrownBy(() -> hostReady.start(HOST, 7, NOW)).isInstanceOf(BusinessException.class);
        RhythmBattleRoom ready = hostReady.ready(GUEST, true, 2, NOW);
        assertThatThrownBy(() -> ready.start(GUEST, 7, NOW)).isInstanceOf(BusinessException.class);

        RhythmBattleRoom started = ready.start(HOST, 7, NOW);
        assertThat(started.getStatus()).isEqualTo(BattleRoomStatus.PLAYING);
        assertThat(started.getGameNumber()).isEqualTo(1);
        assertThat(started.getSeed()).isEqualTo(7);
        assertThat(started.getStartsAt()).isEqualTo(NOW.plus(RhythmBattleRoom.COUNTDOWN));
        assertThat(started.scrollSpeedOf(HOST)).isEqualTo(1.5);
        assertThat(started.scrollSpeedOf(GUEST)).isEqualTo(2);
        assertThat(started.isHostReady()).isFalse();
        assertThat(started.isGuestReady()).isFalse();
        assertThat(started.getRevision()).isGreaterThan(ready.getRevision());
    }

    @Test
    @DisplayName("준비할 때 고른 세균 이동 배속은 1.0부터 3.0까지 0.25 단위만 받는다")
    void rejectsInvalidScrollSpeedOnReady() {
        // Given
        RhythmBattleRoom room = RhythmBattleRoom.create(HOST, "가을", BattleVisibility.PUBLIC, RhythmLevel.EASY, NOW)
                .join(GUEST, "겨울", NOW);

        // When & Then
        assertThatThrownBy(() -> room.ready(HOST, true, 1.1, NOW)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> room.ready(HOST, true, 3.25, NOW)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("판이 끝나면 승자와 이유를 남기고, 다시 둘 다 준비하면 다음 판을 시작한다")
    void finishesAndStartsTheNextGame() {
        // Given
        RhythmBattleRoom playing = playing();

        // When
        RhythmBattleRoom finished = playing.finish(BattleOutcome.win(GUEST, BattleEndReason.ELIMINATED), NOW);
        RhythmBattleRoom again = finished.ready(HOST, true, 1, NOW).ready(GUEST, true, 1, NOW).start(HOST, 9, NOW);

        // Then
        assertThat(finished.getStatus()).isEqualTo(BattleRoomStatus.FINISHED);
        assertThat(finished.getWinnerMemberId()).isEqualTo(GUEST);
        assertThat(finished.getEndReason()).isEqualTo(BattleEndReason.ELIMINATED);
        assertThat(finished.getStartsAt()).isNull();
        assertThat(again.getGameNumber()).isEqualTo(2);
        assertThat(again.getWinnerMemberId()).isNull();
        assertThat(again.getEndReason()).isNull();
    }

    @Test
    @DisplayName("대기 중 상대가 나가면 자리를 비우고, 방장이 나가거나 판이 시작된 뒤 나가면 방을 닫는다")
    void leavingReleasesTheSeatOrClosesTheRoom() {
        // Given
        RhythmBattleRoom waiting = RhythmBattleRoom.create(HOST, "가을", BattleVisibility.PUBLIC, RhythmLevel.EASY, NOW)
                .join(GUEST, "겨울", NOW).ready(GUEST, true, 1, NOW);

        // When
        RhythmBattleRoom guestLeft = waiting.leave(GUEST, NOW);
        RhythmBattleRoom hostLeft = waiting.leave(HOST, NOW);
        RhythmBattleRoom finishedLeft =
                playing().finish(BattleOutcome.win(HOST, BattleEndReason.FORFEIT), NOW).leave(GUEST, NOW);

        // Then
        assertThat(guestLeft.getStatus()).isEqualTo(BattleRoomStatus.WAITING);
        assertThat(guestLeft.getGuestMemberId()).isNull();
        assertThat(guestLeft.isGuestReady()).isFalse();
        assertThat(hostLeft.getStatus()).isEqualTo(BattleRoomStatus.CLOSED);
        assertThat(finishedLeft.getStatus()).isEqualTo(BattleRoomStatus.CLOSED);
        assertThat(finishedLeft.getWinnerMemberId()).isEqualTo(HOST);
    }

    @Test
    @DisplayName("대기와 결과 상태로 30분 동안 활동이 없으면 방을 닫고, 진행 중인 방은 시간으로 닫지 않는다")
    void closesIdleRooms() {
        // Given
        RhythmBattleRoom waiting = RhythmBattleRoom.create(HOST, "가을", BattleVisibility.PUBLIC, RhythmLevel.EASY, NOW);
        RhythmBattleRoom playing = playing();

        // When & Then
        assertThat(waiting.expire(NOW.plusMinutes(29))).isSameAs(waiting);
        assertThat(waiting.expire(NOW.plusMinutes(30)).getStatus()).isEqualTo(BattleRoomStatus.CLOSED);
        assertThat(playing.expire(NOW.plusMinutes(60))).isSameAs(playing);
    }

    @Test
    @DisplayName("초대 전용 방은 대기 중에만 초대 링크를 새로 만들고, 참가하지 않은 회원은 방을 다룰 수 없다")
    void invitesOnlyWhileWaiting() {
        // Given
        RhythmBattleRoom room = RhythmBattleRoom.create(HOST, "가을", BattleVisibility.PRIVATE, RhythmLevel.EASY, NOW);

        // When & Then
        assertThat(room.invite(HOST, "hash", NOW).getInviteHash()).isEqualTo("hash");
        assertThatThrownBy(() -> room.invite(GUEST, "hash", NOW)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> playing().invite(HOST, "hash", NOW)).isInstanceOf(BusinessException.class);
    }

    private static RhythmBattleRoom playing() {
        return RhythmBattleRoom.create(HOST, "가을", BattleVisibility.PUBLIC, RhythmLevel.EASY, NOW)
                .join(GUEST, "겨울", NOW)
                .ready(HOST, true, 1, NOW)
                .ready(GUEST, true, 1, NOW)
                .start(HOST, 7, NOW);
    }
}
