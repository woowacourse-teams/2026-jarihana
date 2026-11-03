package com.project.jarihana.minigame.command.repository;

import com.project.jarihana.minigame.domain.MinigameEvent;
import com.project.jarihana.minigame.domain.MinigameRun;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

public interface MinigameRunCommandRepository extends JpaRepository<MinigameRun, Long> {

    long countByEventAndMemberIdAndPlayedOn(MinigameEvent event, long memberId, LocalDate playedOn);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<MinigameRun> findWithLockByIdAndMemberId(long id, long memberId);
}
