package com.project.jarihana.rhythmbattle.command.repository;

import com.project.jarihana.rhythmbattle.domain.RhythmBattleChatMessage;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;
import java.util.UUID;

public interface RhythmBattleChatMessageRepository extends JpaRepository<RhythmBattleChatMessage, Long> {
    Optional<RhythmBattleChatMessage> findByRoomIdAndMemberIdAndClientMessageId(long roomId, long memberId,
            UUID clientMessageId);

    @Query("select coalesce(max(m.id), 0) from RhythmBattleChatMessage m where m.roomId = :roomId")
    long findLatestId(long roomId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from RhythmBattleChatMessage m where m.roomId = :roomId")
    void removeByRoomId(long roomId);
}
