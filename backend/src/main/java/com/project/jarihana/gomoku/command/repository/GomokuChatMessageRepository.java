package com.project.jarihana.gomoku.command.repository;

import com.project.jarihana.gomoku.domain.GomokuChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;
import java.util.UUID;

public interface GomokuChatMessageRepository extends JpaRepository<GomokuChatMessage, Long> {
    Optional<GomokuChatMessage> findByRoomIdAndParticipationIdAndClientMessageId(
            long roomId, UUID participationId, UUID clientMessageId);

    @Modifying
    @Query("delete from GomokuChatMessage m where m.roomId=:roomId")
    void removeByRoomId(long roomId);
}
