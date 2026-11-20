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

    @EntityGraph(attributePaths = "member")
    @Query("""
            select subscription from PushSubscription subscription
            where subscription.member.id in :memberIds
              and subscription.enabled = true
              and subscription.member.withdrawnAt is null
              and subscription.clientVersion >= 2
            order by subscription.member.id, subscription.id
            """)
    List<PushSubscription> findAnnouncementCapableByMemberIds(@Param("memberIds") List<Long> memberIds);

    @Query(value = """
            select subscription.* from push_subscriptions subscription
            join member on member.id = subscription.member_id
            where subscription.member_id in (:memberIds)
              and subscription.enabled
              and member.withdrawn_at is null
              and subscription.client_version >= 3
              and not exists (
                  select 1 from member_activity activity
                  where activity.member_id = subscription.member_id
                    and activity.last_active_at > :activityCutoff
              )
            order by subscription.member_id, subscription.id
            """, nativeQuery = true)
    List<PushSubscription> findChatCapableForInactiveMembers(@Param("memberIds") List<Long> memberIds,
                                                            @Param("activityCutoff") LocalDateTime activityCutoff);

    @EntityGraph(attributePaths = "member")
    @Query("""
            select subscription from PushSubscription subscription
            where subscription.enabled = true and subscription.member.id <> :creatorMemberId
                and subscription.member.withdrawnAt is null
            order by subscription.member.id, subscription.id
            """)
    List<PushSubscription> findActiveExceptCreator(@Param("creatorMemberId") long creatorMemberId);
}
