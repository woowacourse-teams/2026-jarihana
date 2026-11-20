package com.project.jarihana.gomoku.command.repository;

import com.project.jarihana.gomoku.domain.GomokuGame;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface GomokuGameRepository extends JpaRepository<GomokuGame, Long> {
    Optional<GomokuGame> findByRoomIdAndGameNumber(long roomId, int gameNumber);
}
