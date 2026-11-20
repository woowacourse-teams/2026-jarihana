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
        // The following statement gets a fresh snapshot after acquiring the shared subscription lock.
        // Delivery row locks alone allow two workers to claim different messages in the same room.
        var chatSubscriptions = lockChatSubscriptions(now, limit);
        return claimNextRows(now, lockedUntil, UUID.randomUUID(), limit,
                chatSubscriptions.isEmpty() ? List.of(-1L) : chatSubscriptions).stream()
                .map(row -> new DeliveryClaim(row.getId(), row.getToken(), DeliveryStatus.valueOf(row.getStatus()),
                        row.getAttemptCount()))
                .toList();
    }

    @Query(value = """
            select s.id from push_subscriptions s
            join lateral (
                select d.next_attempt_at, d.id
                from notification_deliveries d join notifications n on n.id = d.notification_id
                where d.push_subscription_id = s.id and n.event_type = 'CHAT_MESSAGE_RECEIVED'
                    and ((d.status in ('PENDING', 'RETRY') and d.next_attempt_at <= :now)
                        or (d.status = 'IN_FLIGHT' and d.locked_until <= :now))
                order by d.next_attempt_at, d.id limit 1
            ) due on true
            order by due.next_attempt_at, due.id, s.id for no key update of s skip locked limit :limit
            """, nativeQuery = true)
    List<Long> lockChatSubscriptions(@Param("now") LocalDateTime now, @Param("limit") int limit);

    @Query(value = """
            with due_candidate as materialized (
                select d.id, d.next_attempt_at
                from notification_deliveries d join notifications n on n.id = d.notification_id
                where d.status in ('PENDING', 'RETRY') and d.next_attempt_at <= :now
                    and (n.event_type <> 'CHAT_MESSAGE_RECEIVED' or d.push_subscription_id in (:chatSubscriptions))
                order by d.next_attempt_at, d.id
                for update of d skip locked limit :limit
            ), expired_candidate as materialized (
                select d.id, d.next_attempt_at
                from notification_deliveries d join notifications n on n.id = d.notification_id
                where d.status = 'IN_FLIGHT' and d.locked_until <= :now
                    and (n.event_type <> 'CHAT_MESSAGE_RECEIVED' or d.push_subscription_id in (:chatSubscriptions))
                order by d.next_attempt_at, d.id
                for update of d skip locked limit :limit
            ), selected_candidate as materialized (
                select id from (
                    select id, next_attempt_at from due_candidate
                    union all
                    select id, next_attempt_at from expired_candidate
                ) candidates
                order by next_attempt_at, id limit :limit
            ), evaluated as materialized (
                select d.id, d.attempt_count, activity.last_active_at, case
                    when (""" + ChatPushPolicySql.STALE_TARGET + """
                    ) then 'STALE_TARGET'
                    when (""" + ChatPushPolicySql.READ + """
                    ) then 'CHAT_READ'
                    when d.expires_at <= :now or d.attempt_count >= 5 then 'EXPIRED_OR_EXHAUSTED'
                    when (""" + ChatPushPolicySql.NEWER_REPRESENTATIVE + """
                    ) then 'CHAT_COALESCED'
                    when (""" + ChatPushPolicySql.ACTIVE + """
                    ) then 'ACCOUNT_ACTIVE'
                    when n.event_type = 'CHAT_MESSAGE_RECEIVED' and (""" + ChatPushPolicySql.ROOM_IN_FLIGHT + """
                    )
                        then 'CHAT_IN_FLIGHT'
                    else null end as reason
                from selected_candidate selected
                join notification_deliveries d on d.id = selected.id
                join notifications n on n.id = d.notification_id
                join push_subscriptions s on s.id = d.push_subscription_id
                """ + ChatPushPolicySql.SOURCE_JOIN + """
            ), candidate as (
                select evaluated.*, case
                    when reason in ('STALE_TARGET', 'CHAT_READ', 'CHAT_COALESCED') then 'CANCELLED'
                    when reason = 'EXPIRED_OR_EXHAUSTED' then 'FAILED'
                    when reason in ('ACCOUNT_ACTIVE', 'CHAT_IN_FLIGHT')
                        then case when attempt_count = 0 then 'PENDING' else 'RETRY' end
                    else 'IN_FLIGHT' end as next_status from evaluated
            ), updated as (
                update notification_deliveries d set
                    status = c.next_status,
                    attempt_count = d.attempt_count + case when c.next_status = 'IN_FLIGHT' then 1 else 0 end,
                    next_attempt_at = case
                        when c.reason = 'ACCOUNT_ACTIVE' then least(d.expires_at, c.last_active_at + interval '15 seconds')
                        when c.reason = 'CHAT_IN_FLIGHT' then least(d.expires_at, cast(:now as timestamp) + interval '1 second')
                        else d.next_attempt_at end,
                    lease_token = case when c.next_status = 'IN_FLIGHT' then cast(:token as uuid) else null end,
                    locked_until = case when c.next_status = 'IN_FLIGHT' then cast(:lockedUntil as timestamp) else null end,
                    last_error_code = c.reason, updated_at = :now
                from candidate c where d.id = c.id
                returning d.id, d.lease_token, d.status, d.attempt_count, d.next_attempt_at
            )
            select id as "id", lease_token as "token", status as "status", attempt_count as "attemptCount"
            from updated order by next_attempt_at, id
            """, nativeQuery = true)
    List<ClaimProjection> claimNextRows(@Param("now") LocalDateTime now,
                                      @Param("lockedUntil") LocalDateTime lockedUntil,
                                      @Param("token") UUID token, @Param("limit") int limit,
                                      @Param("chatSubscriptions") List<Long> chatSubscriptions);

    default Optional<PushRequest> prepare(DeliveryClaim claim, LocalDateTime now) {
        return prepare(List.of(claim), now).stream().findFirst();
    }

    default List<PushRequest> prepare(List<DeliveryClaim> claims, LocalDateTime now) {
        if (claims.isEmpty()) {
            return List.of();
        }
        return prepareRows(claimKeys(claims), now).stream()
                .map(row -> new PushRequest(row.getDeliveryId(), row.getNotificationId(), row.getSubscriptionId(),
                        row.getGeneration(), row.getPayloadVersion(), row.getEndpoint(), row.getP256dh(),
                        row.getAuth(), row.getExpiresAt()))
                .toList();
    }

    @Query(value = """
            with candidate as materialized (
                select d.id, d.notification_id, d.push_subscription_id, d.subscription_generation,
                    d.expires_at, d.attempt_count, n.payload_version, s.endpoint, s.p256dh, s.auth,
                    activity.last_active_at, case
                        when d.expires_at <= :now then 'EXPIRED_OR_EXHAUSTED'
                        when (""" + ChatPushPolicySql.STALE_TARGET + """
                    ) then 'STALE_TARGET'
                        when (""" + ChatPushPolicySql.READ + """
                    ) then 'CHAT_READ'
                        when (""" + ChatPushPolicySql.ACTIVE + """
                    ) then 'ACCOUNT_ACTIVE'
                        else null end as reason
                from notification_deliveries d
                join jsonb_to_recordset(cast(:claims as jsonb)) as claim(id bigint, token uuid)
                    on claim.id = d.id and claim.token = d.lease_token
                join notifications n on n.id = d.notification_id
                join push_subscriptions s on s.id = d.push_subscription_id
                """ + ChatPushPolicySql.SOURCE_JOIN + """
                where d.status = 'IN_FLIGHT' and d.locked_until > :now
                for update of d
            ), resolved as (
                update notification_deliveries d set
                    status = case
                        when c.reason = 'EXPIRED_OR_EXHAUSTED' then 'FAILED'
                        when c.reason = 'ACCOUNT_ACTIVE' then case when c.attempt_count = 1 then 'PENDING' else 'RETRY' end
                        else 'CANCELLED' end,
                    attempt_count = c.attempt_count - case when c.reason = 'ACCOUNT_ACTIVE' then 1 else 0 end,
                    next_attempt_at = case when c.reason = 'ACCOUNT_ACTIVE'
                        then least(d.expires_at, c.last_active_at + interval '15 seconds') else d.next_attempt_at end,
                    lease_token = null, locked_until = null, last_error_code = c.reason, updated_at = :now
                from candidate c where d.id = c.id and c.reason is not null
            )
            select id as "deliveryId", notification_id as "notificationId", push_subscription_id as "subscriptionId",
                subscription_generation as "generation", expires_at as "expiresAt", payload_version as "payloadVersion",
                endpoint as "endpoint", p256dh as "p256dh", auth as "auth"
            from candidate where reason is null
            """, nativeQuery = true)
    List<SendableProjection> prepareRows(@Param("claims") String claims, @Param("now") LocalDateTime now);

    private static String claimKeys(List<DeliveryClaim> claims) {
        return claims.stream()
                .filter(claim -> claim.token() != null)
                .map(claim -> "{\"id\":" + claim.id() + ",\"token\":\"" + claim.token() + "\"}")
                .collect(Collectors.joining(",", "[", "]"));
    }

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
