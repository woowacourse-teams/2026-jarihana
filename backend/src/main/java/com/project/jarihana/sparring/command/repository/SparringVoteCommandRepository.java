package com.project.jarihana.sparring.command.repository;

import com.project.jarihana.sparring.domain.SparringVote;

import org.springframework.data.repository.Repository;

import java.util.Optional;

public interface SparringVoteCommandRepository extends Repository<SparringVote, Long> {
    SparringVote save(SparringVote value);

    Optional<SparringVote> findByTopicIdAndMemberId(long topicId, long memberId);
}
