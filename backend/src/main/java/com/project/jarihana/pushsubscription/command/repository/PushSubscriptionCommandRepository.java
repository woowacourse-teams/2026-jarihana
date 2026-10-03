package com.project.jarihana.pushsubscription.command.repository;

import com.project.jarihana.pushsubscription.domain.PushSubscription;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PushSubscriptionCommandRepository extends Repository<PushSubscription, Long> {

    PushSubscription save(PushSubscription subscription);

    Optional<PushSubscription> findByIdAndMemberId(long id, long memberId);

    Optional<PushSubscription> findByEndpoint(String endpoint);

    @EntityGraph(attributePaths = "member")
    @Query("""
            select subscription
            from PushSubscription subscription
            where subscription.member.id = :memberId and subscription.enabled = true
            order by subscription.id
            """)
    List<PushSubscription> findActiveByMemberId(@Param("memberId") long memberId);
}
