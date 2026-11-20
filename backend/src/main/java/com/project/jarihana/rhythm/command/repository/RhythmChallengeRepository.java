package com.project.jarihana.rhythm.command.repository;

import com.project.jarihana.rhythm.domain.RhythmChallenge;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface RhythmChallengeRepository extends JpaRepository<RhythmChallenge, Long> {
    // 같은 판의 입력 묶음은 한 번에 하나씩 계산해야 순서와 계산 캐시가 맞는다.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from RhythmChallenge c where c.id=:id")
    Optional<RhythmChallenge> lockById(long id);
}
