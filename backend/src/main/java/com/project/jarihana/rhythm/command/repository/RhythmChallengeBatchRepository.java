package com.project.jarihana.rhythm.command.repository;

import com.project.jarihana.rhythm.domain.RhythmChallengeBatch;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RhythmChallengeBatchRepository extends JpaRepository<RhythmChallengeBatch, Long> {
    List<RhythmChallengeBatch> findByChallengeIdOrderBySequence(long challengeId);
}
