package com.project.jarihana.sparring.command.repository;

import com.project.jarihana.sparring.domain.SparringPost;

import org.springframework.data.repository.Repository;

import java.util.Optional;
import java.util.UUID;

public interface SparringPostCommandRepository extends Repository<SparringPost, Long> {
    SparringPost save(SparringPost value);

    Optional<SparringPost> findByTopicIdAndMemberIdAndRequestId(
            long topicId, long memberId, UUID requestId);

    Optional<SparringPost> findByIdAndTopicId(long id, long topicId);
}
