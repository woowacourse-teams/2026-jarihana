package com.project.jarihana.minigame.command.repository;

import com.project.jarihana.minigame.domain.MinigameCut;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MinigameCutCommandRepository extends JpaRepository<MinigameCut, Long> {
}
