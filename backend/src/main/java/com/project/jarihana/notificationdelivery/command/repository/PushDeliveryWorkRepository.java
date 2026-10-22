package com.project.jarihana.notificationdelivery.command.repository;

import com.project.jarihana.notificationdelivery.client.dto.PushRequest;
import com.project.jarihana.notificationdelivery.command.repository.dto.DeliveryClaim;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

public interface PushDeliveryWorkRepository extends Repository<NotificationDelivery, Long> {

    default Optional<DeliveryClaim> claimNext(LocalDateTime now, LocalDateTime lockedUntil) {
        return claimNext(now, lockedUntil, 1).stream().findFirst();
    }

    default List<DeliveryClaim> claimNext(LocalDateTime now, LocalDateTime lockedUntil, int limit) {
        if (limit < 0) {
            throw new IllegalArgumentException("Claim limit must not be negative");
        }
        if (limit == 0) {
            return List.of();
        }
        return claimNextRows(now, lockedUntil, UUID.randomUUID(), limit).stream()
                .map(row -> new DeliveryClaim(row.getId(), row.getToken(), DeliveryStatus.valueOf(row.getStatus()),
                        row.getAttemptCount()))
                .toList();
    }

    @Query(value = """
            with due_candidate as materialized (
                select d.id, d.next_attempt_at
                from notification_deliveries d
                where d.status in ('PENDING', 'RETRY') and d.next_attempt_at <= :now
                order by d.next_attempt_at, d.id
                for update of d skip locked limit :limit
            ), expired_candidate as materialized (
                select d.id, d.next_attempt_at
                from notification_deliveries d
                where d.status = 'IN_FLIGHT' and d.locked_until <= :now
                order by d.next_attempt_at, d.id
                for update of d skip locked limit :limit
            ), selected_candidate as materialized (
                select id from (
                    select id, next_attempt_at from due_candidate
                    union all
                    select id, next_attempt_at from expired_candidate
                ) candidates
                order by next_attempt_at, id limit :limit
            ), candidate as (
                select d.id, case
                    when n.deleted_at is not null or not s.enabled or d.subscription_generation <> s.generation
                        or n.member_id <> s.member_id then 'CANCELLED'
                    when d.expires_at <= :now or d.attempt_count >= 5 then 'FAILED'
                    else 'IN_FLIGHT' end as next_status
                from selected_candidate selected
                join notification_deliveries d on d.id = selected.id
                join notifications n on n.id = d.notification_id
                join push_subscriptions s on s.id = d.push_subscription_id
            ), updated as (
            update notification_deliveries d set
                status = c.next_status,
                attempt_count = d.attempt_count + case when c.next_status = 'IN_FLIGHT' then 1 else 0 end,
                lease_token = case when c.next_status = 'IN_FLIGHT' then cast(:token as uuid) else null end,
                locked_until = case when c.next_status = 'IN_FLIGHT' then cast(:lockedUntil as timestamp) else null end,
                last_error_code = case when c.next_status = 'FAILED' then 'EXPIRED_OR_EXHAUSTED'
                                       when c.next_status = 'CANCELLED' then 'STALE_TARGET' else null end,
                updated_at = :now
            from candidate c where d.id = c.id
            returning d.id, d.lease_token, d.status, d.attempt_count, d.next_attempt_at
            )
            select id as "id", lease_token as "token", status as "status", attempt_count as "attemptCount"
            from updated order by next_attempt_at, id
            """, nativeQuery = true)
    List<ClaimProjection> claimNextRows(@Param("now") LocalDateTime now,
                                      @Param("lockedUntil") LocalDateTime lockedUntil,
                                      @Param("token") UUID token, @Param("limit") int limit);

    default Optional<PushRequest> findSendable(DeliveryClaim claim, LocalDateTime now) {
        return findSendable(List.of(claim), now).stream().findFirst();
    }

    default List<PushRequest> findSendable(List<DeliveryClaim> claims, LocalDateTime now) {
        if (claims.isEmpty()) {
            return List.of();
        }
        return findSendableRows(claimKeys(claims), now).stream()
                .map(row -> new PushRequest(row.getDeliveryId(), row.getNotificationId(), row.getSubscriptionId(),
                        row.getGeneration(), row.getPayloadVersion(), row.getEndpoint(), row.getP256dh(),
                        row.getAuth(), row.getExpiresAt()))
                .toList();
    }

    @Query(value = """
            select d.id as "deliveryId", d.notification_id as "notificationId",
                   d.push_subscription_id as "subscriptionId", d.subscription_generation as "generation",
                   d.expires_at as "expiresAt", n.payload_version as "payloadVersion",
                   s.endpoint as "endpoint", s.p256dh as "p256dh", s.auth as "auth"
            from notification_deliveries d
            join jsonb_to_recordset(cast(:claims as jsonb)) as claim(id bigint, token uuid)
                on claim.id = d.id and claim.token = d.lease_token
            join notifications n on n.id = d.notification_id
            join push_subscriptions s on s.id = d.push_subscription_id
            where d.status = 'IN_FLIGHT' and d.locked_until > :now
                and d.expires_at > :now and n.deleted_at is null and s.enabled
                and d.subscription_generation = s.generation and n.member_id = s.member_id
            """, nativeQuery = true)
    List<SendableProjection> findSendableRows(@Param("claims") String claims, @Param("now") LocalDateTime now);

    default void cancelUnsendable(DeliveryClaim claim, LocalDateTime now) {
        cancelUnsendable(List.of(claim), now);
    }

    default void cancelUnsendable(List<DeliveryClaim> claims, LocalDateTime now) {
        if (!claims.isEmpty()) {
            cancelUnsendableRows(claimKeys(claims), now);
        }
    }

    private static String claimKeys(List<DeliveryClaim> claims) {
        return claims.stream()
                .filter(claim -> claim.token() != null)
                .map(claim -> "{\"id\":" + claim.id() + ",\"token\":\"" + claim.token() + "\"}")
                .collect(Collectors.joining(",", "[", "]"));
    }

    @Modifying
    @Query(value = """
            update notification_deliveries d set status = case when expires_at <= :now then 'FAILED' else 'CANCELLED' end,
                lease_token = null, locked_until = null, last_error_code = 'STALE_TARGET', updated_at = :now
            from jsonb_to_recordset(cast(:claims as jsonb)) as claim(id bigint, token uuid)
            where d.id = claim.id and d.status = 'IN_FLIGHT' and d.lease_token = claim.token and d.locked_until > :now
            """, nativeQuery = true)
    int cancelUnsendableRows(@Param("claims") String claims, @Param("now") LocalDateTime now);

    default int finish(DeliveryClaim claim, DeliveryStatus status, LocalDateTime nextAttemptAt,
                       String code, LocalDateTime now) {
        return finishRow(claim.id(), claim.token(), status.name(), nextAttemptAt,
                status == DeliveryStatus.ACCEPTED ? now : null, code, now);
    }

    @Modifying
    @Query(value = """
            update notification_deliveries d set status = :status, next_attempt_at = :nextAttemptAt,
                accepted_at = cast(:acceptedAt as timestamp), lease_token = null, locked_until = null,
                last_error_code = cast(:code as varchar), updated_at = :now
            where d.id = :id and d.status = 'IN_FLIGHT' and d.lease_token = cast(:token as uuid) and d.locked_until > :now
            """, nativeQuery = true)
    int finishRow(@Param("id") long id, @Param("token") UUID token, @Param("status") String status,
                  @Param("nextAttemptAt") LocalDateTime nextAttemptAt, @Param("acceptedAt") LocalDateTime acceptedAt,
                  @Param("code") String code, @Param("now") LocalDateTime now);

    default int attemptCount(long id) {
        return findAttemptCount(id).orElseThrow(() -> new EmptyResultDataAccessException(1));
    }

    @Query(value = "select attempt_count from notification_deliveries where id = :id", nativeQuery = true)
    Optional<Integer> findAttemptCount(@Param("id") long id);

    interface ClaimProjection {
        long getId();

        UUID getToken();

        String getStatus();

        int getAttemptCount();
    }

    interface SendableProjection {
        long getDeliveryId();

        long getNotificationId();

        long getSubscriptionId();

        long getGeneration();

        int getPayloadVersion();

        String getEndpoint();

        String getP256dh();

        String getAuth();

        LocalDateTime getExpiresAt();
    }
}
