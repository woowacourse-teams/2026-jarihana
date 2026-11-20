package com.project.jarihana.gomoku.command.repository;

import com.project.jarihana.gomoku.domain.GomokuMove;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface GomokuMoveRepository extends JpaRepository<GomokuMove, Long> {
    Optional<GomokuMove> findByRoomIdAndGameNumberAndMemberIdAndRequestId(
            long roomId, int gameNumber, long memberId, UUID requestId);
}
