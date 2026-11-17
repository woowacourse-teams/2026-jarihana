package com.project.jarihana.rhythmbattle.command.repository;

import com.project.jarihana.rhythmbattle.domain.RhythmBattleSeat;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface RhythmBattleSeatRepository extends JpaRepository<RhythmBattleSeat, Long> {
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from RhythmBattleSeat s where s.roomId = :roomId")
    void releaseRoom(long roomId);
}
