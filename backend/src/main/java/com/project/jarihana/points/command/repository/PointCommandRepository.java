package com.project.jarihana.points.command.repository;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.points.config.PointPolicy;
import com.project.jarihana.points.domain.PointReward.SkipReason;
import com.project.jarihana.points.domain.PointReward;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
@RequiredArgsConstructor
public class PointCommandRepository {
    private final JdbcClient jdbc;

    public void lockWallet(long memberId) {
        try {
            jdbc.sql("INSERT INTO point_wallet (member_id) VALUES (?) ON CONFLICT DO NOTHING")
                    .param(memberId).update();
            // A row write makes stale REPEATABLE READ transactions fail before checking quota.
            jdbc.sql("UPDATE point_wallet SET balance = balance WHERE member_id = ?")
                    .param(memberId).update();
        } catch (PessimisticLockingFailureException conflict) {
            throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                    "포인트 적립이 동시에 진행 중입니다. 다시 시도해 주세요.", conflict);
        }
    }

    public void recordGroupOrigin(long groupId, long creatorId, LocalDateTime createdAt) {
        jdbc.sql("INSERT INTO point_group_origin VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
                .params(groupId, creatorId, createdAt).update();
    }

    public Optional<GroupOrigin> findGroupOrigin(long groupId) {
        return jdbc.sql("SELECT creator_member_id, created_at FROM point_group_origin WHERE group_id = ?")
                .param(groupId)
                .query((row, index) -> new GroupOrigin(row.getLong(1), row.getObject(2, LocalDateTime.class)))
                .optional();
    }

    public List<Long> findMembersWithoutAward(String reason, int limit) {
        return jdbc.sql("""
                SELECT member.id FROM member
                WHERE NOT EXISTS (
                    SELECT 1 FROM point_reward
                    WHERE member_id = member.id AND reason = ? AND status <> 'SKIPPED'
                )
                ORDER BY member.id LIMIT ?
                """).params(reason, limit).query(Long.class).list();
    }

    public boolean hasOlderMembership(long memberId, LocalDateTime startsAt) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM group_member WHERE member_id = ? AND joined_at < ?)")
                .params(memberId, startsAt).query(Boolean.class).single();
    }

    public boolean hasSource(PointReward reward) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM point_reward WHERE member_id = ? AND reason = ? AND source_key = ?)
                """).params(reward.memberId(), reward.rule().code(), reward.sourceKey()).query(Boolean.class).single();
    }

    public boolean hasAward(long memberId, String reason) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM point_reward WHERE member_id = ? AND reason = ? AND status <> 'SKIPPED')
                """).params(memberId, reason).query(Boolean.class).single();
    }

    public int countDuring(PointReward reward, LocalDateTime start, LocalDateTime end) {
        return jdbc.sql("""
                SELECT count(*) FROM point_reward
                WHERE member_id = ? AND reason = ? AND occurred_at >= ? AND occurred_at < ? AND status <> 'SKIPPED'
                """).params(reward.memberId(), reward.rule().code(), start, end).query(Integer.class).single();
    }

    public boolean hasScope(PointReward reward) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM point_reward
                    WHERE member_id = ? AND reason = ? AND scope_key = ? AND status <> 'SKIPPED')
                """).params(reward.memberId(), reward.rule().code(), reward.scopeKey()).query(Boolean.class).single();
    }

    public void record(PointReward reward, SkipReason skipReason, LocalDateTime now) {
        jdbc.sql("""
                INSERT INTO point_reward
                    (member_id, reason, source_key, scope_key, policy_version, amount, occurred_at,
                     status, skip_reason, next_attempt_at)
                VALUES (:member, :reason, :source, :scope, :version, :amount, :occurredAt, :status, :skip, :now)
                """).param("member", reward.memberId()).param("reason", reward.rule().code())
                .param("source", reward.sourceKey()).param("scope", reward.rule().oncePerMember() ? "once" : reward.scopeKey())
                .param("version", PointPolicy.VERSION).param("amount", reward.amount())
                .param("occurredAt", reward.occurredAt())
                .param("status", skipReason == null ? "PENDING" : "SKIPPED")
                .param("skip", skipReason == null ? null : skipReason.name())
                .param("now", now).update();
    }

    public Optional<DueReward> lockNextDue(LocalDateTime now) {
        return jdbc.sql("""
                SELECT id, member_id, amount, attempts FROM point_reward
                WHERE status = 'PENDING' AND next_attempt_at <= ?
                ORDER BY next_attempt_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
                """).param(now).query((row, index) -> new DueReward(row.getLong(1), row.getLong(2),
                row.getLong(3), row.getInt(4))).optional();
    }

    public void complete(DueReward reward, LocalDateTime now) {
        jdbc.sql("INSERT INTO point_ledger (reward_id, member_id, amount, created_at) VALUES (?, ?, ?, ?)")
                .params(reward.id(), reward.memberId(), reward.amount(), now).update();
        jdbc.sql("UPDATE point_wallet SET balance = balance + ? WHERE member_id = ?")
                .params(reward.amount(), reward.memberId()).update();
        jdbc.sql("UPDATE point_reward SET status = 'COMPLETED', completed_at = ? WHERE id = ?")
                .params(now, reward.id()).update();
    }

    public void recordFailure(DueReward reward, LocalDateTime nextAttemptAt, boolean retry) {
        jdbc.sql("""
                UPDATE point_reward SET attempts = attempts + 1, next_attempt_at = ?, status = ?
                WHERE id = ? AND status = 'PENDING' AND attempts = ?
                """).params(nextAttemptAt, retry ? "PENDING" : "NEEDS_REVIEW", reward.id(), reward.attempts()).update();
    }

    public record GroupOrigin(long creatorMemberId, LocalDateTime createdAt) {
    }

    public record DueReward(long id, long memberId, long amount, int attempts) {
    }
}
