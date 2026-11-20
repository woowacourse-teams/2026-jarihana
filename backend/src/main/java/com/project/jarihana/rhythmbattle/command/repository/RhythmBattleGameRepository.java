package com.project.jarihana.rhythmbattle.command.repository;

import com.project.jarihana.rhythmbattle.domain.RhythmBattleGame;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RhythmBattleGameRepository extends JpaRepository<RhythmBattleGame, Long> {
    Optional<RhythmBattleGame> findByRoomIdAndGameNumber(long roomId, int gameNumber);
}
