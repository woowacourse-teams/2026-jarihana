package com.project.jarihana.gomoku.command.repository;

import com.project.jarihana.gomoku.domain.GomokuRoom;

import jakarta.persistence.LockModeType;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface GomokuRoomRepository extends JpaRepository<GomokuRoom, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from GomokuRoom r where r.id=:id")
    Optional<GomokuRoom> lockById(long id);

    @Query(
            "select r.id from GomokuRoom r where"
                + " (r.status=com.project.jarihana.gomoku.domain.RoomStatus.PLAYING and"
                + " r.turnDeadline<=:now) or (r.status in"
                + " (com.project.jarihana.gomoku.domain.RoomStatus.WAITING,com.project.jarihana.gomoku.domain.RoomStatus.FINISHED)"
                + " and r.touchedAt<=:idle) order by r.id")
    List<Long> findExpired(LocalDateTime now, LocalDateTime idle, Pageable page);
}
