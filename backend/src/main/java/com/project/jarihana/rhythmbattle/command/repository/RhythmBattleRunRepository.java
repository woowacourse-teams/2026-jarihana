package com.project.jarihana.rhythmbattle.command.repository;

import com.project.jarihana.rhythmbattle.domain.RhythmBattleRun;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * 판은 방 잠금 안에서만 바꾸므로 따로 잠그지 않는다.
 */
public interface RhythmBattleRunRepository extends JpaRepository<RhythmBattleRun, Long> {
    List<RhythmBattleRun> findByRoomIdAndGameNumber(long roomId, int gameNumber);

    Optional<RhythmBattleRun> findByRoomIdAndGameNumberAndMemberId(long roomId, int gameNumber, long memberId);
}
