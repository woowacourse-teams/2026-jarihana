package com.project.jarihana.notificationdelivery.command.repository;

import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

public interface NotificationDeliveryCommandRepository extends Repository<NotificationDelivery, Long> {

    NotificationDelivery save(NotificationDelivery delivery);

    Optional<NotificationDelivery> findById(long id);

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
