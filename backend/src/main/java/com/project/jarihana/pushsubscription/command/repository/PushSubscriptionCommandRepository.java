package com.project.jarihana.pushsubscription.command.repository;

import com.project.jarihana.pushsubscription.domain.PushSubscription;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PushSubscriptionCommandRepository extends Repository<PushSubscription, Long> {

    PushSubscription save(PushSubscription subscription);

    Optional<PushSubscription> findByIdAndMemberId(long id, long memberId);

    Optional<PushSubscription> findByEndpoint(String endpoint);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<PushSubscription> findWithLockByEndpoint(String endpoint);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<PushSubscription> findWithLockById(long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<PushSubscription> findWithLockByIdAndMemberId(long id, long memberId);

    @Modifying
    @Query(value = """
            insert into push_subscriptions (member_id, endpoint, p256dh, auth, enabled, generation, last_seen_at, created_at, updated_at)
            values (:memberId, :endpoint, :p256dh, :auth, true, 1, :now, :now, :now)
            on conflict (endpoint) do nothing
            """, nativeQuery = true)
    int insertIfAbsent(@Param("memberId") long memberId, @Param("endpoint") String endpoint,
                      @Param("p256dh") String p256dh, @Param("auth") String auth, @Param("now") LocalDateTime now);

    @EntityGraph(attributePaths = "member")
    @Query("""
            select subscription
            from PushSubscription subscription
            where subscription.member.id = :memberId and subscription.enabled = true
            order by subscription.id
            """)
    List<PushSubscription> findActiveByMemberId(@Param("memberId") long memberId);
}
