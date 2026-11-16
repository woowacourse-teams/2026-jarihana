package com.project.jarihana.rhythmbattle.command.repository;

import com.project.jarihana.rhythmbattle.domain.RhythmBattleBatch;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RhythmBattleBatchRepository extends JpaRepository<RhythmBattleBatch, Long> {
    List<RhythmBattleBatch> findByRunIdOrderBySequence(long runId);
}
