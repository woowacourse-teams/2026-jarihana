package com.project.jarihana.rhythmbattle.command.repository;

import com.project.jarihana.rhythmbattle.domain.RhythmBattleRoom;

import jakarta.persistence.LockModeType;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface RhythmBattleRoomRepository extends JpaRepository<RhythmBattleRoom, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from RhythmBattleRoom r where r.id = :id")
    Optional<RhythmBattleRoom> lockById(long id);

    /**
     * 오래 활동이 없는 대기와 결과 방, 입력 묶음이 끊긴 판이 있는 진행 방을 찾는다.
     */
    @Query("""
            select r.id from RhythmBattleRoom r
            where (r.status in (com.project.jarihana.rhythmbattle.domain.BattleRoomStatus.WAITING,
                        com.project.jarihana.rhythmbattle.domain.BattleRoomStatus.FINISHED)
                    and r.touchedAt <= :idle)
                or (r.status = com.project.jarihana.rhythmbattle.domain.BattleRoomStatus.PLAYING
                    and exists (select 1 from RhythmBattleRun run
                        where run.roomId = r.id and run.gameNumber = r.gameNumber
                            and run.status = com.project.jarihana.rhythmbattle.domain.BattleRunStatus.PLAYING
                            and run.lastBatchAt <= :stale))
            order by r.id
            """)
    List<Long> findExpired(LocalDateTime idle, LocalDateTime stale, Pageable page);
}
