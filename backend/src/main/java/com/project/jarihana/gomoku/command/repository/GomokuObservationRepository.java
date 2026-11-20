package com.project.jarihana.gomoku.command.repository;

import com.project.jarihana.gomoku.domain.GomokuObservation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface GomokuObservationRepository extends JpaRepository<GomokuObservation, Long> {
    Optional<GomokuObservation> findByRoomIdAndMemberIdAndRequestId(long roomId, long memberId, UUID requestId);
    Optional<GomokuObservation> findByRoomIdAndMemberIdAndParticipationId(long roomId, long memberId, UUID participationId);
}
