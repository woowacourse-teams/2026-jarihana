package com.project.jarihana.notificationdelivery.command.repository;

import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

public interface NotificationDeliveryCommandRepository extends Repository<NotificationDelivery, Long> {

    NotificationDelivery save(NotificationDelivery delivery);

    Optional<NotificationDelivery> findById(long id);

    @Transactional(propagation = Propagation.MANDATORY)
    @Modifying
    @Query(value = """
            insert into notification_deliveries (notification_id, push_subscription_id, subscription_generation,
                status, attempt_count, next_attempt_at, expires_at, created_at, updated_at)
            select target."notificationId", target."subscriptionId", target."generation",
                'PENDING', 0, :now, :expiresAt, :now, :now
            from jsonb_to_recordset(cast(:targets as jsonb))
                as target("notificationId" bigint, "subscriptionId" bigint, "generation" bigint)
            order by target."notificationId", target."subscriptionId", target."generation"
            on conflict (notification_id, push_subscription_id, subscription_generation) do nothing
            """, nativeQuery = true)
    int insertAllIfAbsent(@Param("targets") String targets, @Param("now") LocalDateTime now,
                          @Param("expiresAt") LocalDateTime expiresAt);

    @Modifying
    @Query(value = """
            update notification_deliveries
            set status = 'CANCELLED', lease_token = null, locked_until = null, updated_at = :now
            where status in ('PENDING', 'RETRY', 'IN_FLIGHT') and notification_id in (
                select id from notifications where event_type = 'INVITATION_RECEIVED'
                    and payload ->> 'groupId' = cast(:groupId as text)
            )
            """, nativeQuery = true)
    int cancelInvitationsByGroupId(@Param("groupId") long groupId, @Param("now") LocalDateTime now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            update notification_deliveries
            set status = 'CANCELLED', lease_token = null, locked_until = null, updated_at = :now
            where notification_id = :notificationId and status in ('PENDING', 'RETRY', 'IN_FLIGHT')
            """, nativeQuery = true)
    int cancelByNotificationId(@Param("notificationId") long notificationId, @Param("now") LocalDateTime now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            update notification_deliveries
            set status = 'CANCELLED', lease_token = null, locked_until = null, updated_at = :now
            where push_subscription_id = :id and subscription_generation < :generation
              and status in ('PENDING', 'RETRY', 'IN_FLIGHT')
            """, nativeQuery = true)
    int cancelBySubscriptionBeforeGeneration(@Param("id") long id, @Param("generation") long generation,
                                            @Param("now") LocalDateTime now);
}
