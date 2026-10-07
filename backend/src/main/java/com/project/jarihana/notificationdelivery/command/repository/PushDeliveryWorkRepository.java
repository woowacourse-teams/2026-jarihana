package com.project.jarihana.notificationdelivery.command.repository;

import com.project.jarihana.notificationdelivery.client.dto.PushRequest;
import com.project.jarihana.notificationdelivery.command.repository.dto.DeliveryClaim;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class PushDeliveryWorkRepository {
    private final JdbcTemplate jdbc;

    public Optional<DeliveryClaim> claimNext(LocalDateTime now, LocalDateTime lockedUntil) {
        UUID token = UUID.randomUUID();
        var claimed = jdbc.query("""
                with candidate as (
                    select d.id, case
                        when n.deleted_at is not null or not s.enabled or d.subscription_generation <> s.generation
                            or n.member_id <> s.member_id then 'CANCELLED'
                        when d.expires_at <= ? or d.attempt_count >= 5 then 'FAILED'
                        else 'IN_FLIGHT' end as next_status
                    from notification_deliveries d
                    join notifications n on n.id = d.notification_id
                    join push_subscriptions s on s.id = d.push_subscription_id
                    where (d.status in ('PENDING', 'RETRY') and d.next_attempt_at <= ?)
                        or (d.status = 'IN_FLIGHT' and d.locked_until <= ?)
                    order by d.next_attempt_at, d.id
                    for update of d skip locked limit 1
                )
                update notification_deliveries d set
                    status = c.next_status,
                    attempt_count = d.attempt_count + case when c.next_status = 'IN_FLIGHT' then 1 else 0 end,
                    lease_token = case when c.next_status = 'IN_FLIGHT' then cast(? as uuid) else null end,
                    locked_until = case when c.next_status = 'IN_FLIGHT' then cast(? as timestamp) else null end,
                    last_error_code = case when c.next_status = 'FAILED' then 'EXPIRED_OR_EXHAUSTED'
                                           when c.next_status = 'CANCELLED' then 'STALE_TARGET' else null end,
                    updated_at = ?
                from candidate c where d.id = c.id
                returning d.id, d.lease_token, d.status
                """, (rs, row) -> new DeliveryClaim(rs.getLong("id"), rs.getObject("lease_token", UUID.class),
                DeliveryStatus.valueOf(rs.getString("status"))),
                now, now, now, token, lockedUntil, now);
        return claimed.stream().findFirst();
    }

    public Optional<PushRequest> findSendable(DeliveryClaim claim, LocalDateTime now) {
        return jdbc.query("""
                select d.id, d.notification_id, d.push_subscription_id, d.subscription_generation, d.expires_at,
                       n.payload_version, s.endpoint, s.p256dh, s.auth
                from notification_deliveries d
                join notifications n on n.id = d.notification_id
                join push_subscriptions s on s.id = d.push_subscription_id
                where d.id = ? and d.status = 'IN_FLIGHT' and d.lease_token = ? and d.locked_until > ?
                    and d.expires_at > ? and n.deleted_at is null and s.enabled
                    and d.subscription_generation = s.generation and n.member_id = s.member_id
                """, (rs, row) -> new PushRequest(rs.getLong("id"), rs.getLong("notification_id"),
                rs.getLong("push_subscription_id"), rs.getLong("subscription_generation"), rs.getInt("payload_version"),
                rs.getString("endpoint"), rs.getString("p256dh"), rs.getString("auth"),
                rs.getTimestamp("expires_at").toLocalDateTime()),
                claim.id(), claim.token(), now, now).stream().findFirst();
    }

    public void cancelUnsendable(DeliveryClaim claim, LocalDateTime now) {
        jdbc.update("""
                update notification_deliveries set status = case when expires_at <= ? then 'FAILED' else 'CANCELLED' end,
                    lease_token = null, locked_until = null, last_error_code = 'STALE_TARGET', updated_at = ?
                where id = ? and status = 'IN_FLIGHT' and lease_token = ? and locked_until > ?
                """, now, now, claim.id(), claim.token(), now);
    }

    public int finish(DeliveryClaim claim, DeliveryStatus status, LocalDateTime nextAttemptAt, String code, LocalDateTime now) {
        return jdbc.update("""
                update notification_deliveries d set status = ?, next_attempt_at = ?,
                    accepted_at = ?, lease_token = null, locked_until = null, last_error_code = ?, updated_at = ?
                where d.id = ? and d.status = 'IN_FLIGHT' and d.lease_token = ? and d.locked_until > ?
                """, status.name(), nextAttemptAt, status == DeliveryStatus.ACCEPTED ? Timestamp.valueOf(now) : null,
                code, now, claim.id(), claim.token(), now);
    }

    public int attemptCount(long id) {
        return jdbc.queryForObject("select attempt_count from notification_deliveries where id = ?", Integer.class, id);
    }
}
