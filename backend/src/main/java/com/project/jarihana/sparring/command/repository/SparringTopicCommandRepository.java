package com.project.jarihana.sparring.command.repository;

import com.project.jarihana.sparring.domain.SparringTopic;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

import java.util.Optional;

public interface SparringTopicCommandRepository extends Repository<SparringTopic, Long> {
    SparringTopic save(SparringTopic topic);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from SparringTopic t where t.id = :id")
    Optional<SparringTopic> lockById(long id);

    @Modifying(flushAutomatically = true)
    @Query("update SparringTopic t set t.revision = t.revision + 1 where t.id = :id")
    void advanceRevision(long id);
}
