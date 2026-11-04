package com.project.jarihana.gomoku.command.repository;

import com.project.jarihana.gomoku.domain.GomokuSeat;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface GomokuSeatRepository extends JpaRepository<GomokuSeat, Long> {
    @Modifying
    @Query("delete from GomokuSeat s where s.roomId=:roomId")
    void releaseRoom(long roomId);
}
