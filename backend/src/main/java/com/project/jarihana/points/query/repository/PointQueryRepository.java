package com.project.jarihana.points.query.repository;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
@RequiredArgsConstructor
public class PointQueryRepository {
    private final JdbcClient jdbc;

    public long balance(long memberId) {
        return jdbc.sql("SELECT balance FROM point_wallet WHERE member_id = ?")
                .param(memberId).query(Long.class).optional().orElse(0L);
    }

    public boolean hasPendingRewards(long memberId) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM point_reward WHERE member_id = ?
                    AND status = 'PENDING')
                """).param(memberId).query(Boolean.class).single();
    }

    public List<WeeklyCount> weeklyCounts(long memberId, LocalDateTime start, List<String> reasons) {
        return jdbc.sql("""
                SELECT reason, count(*) FILTER (WHERE status = 'COMPLETED') AS completed,
                       count(*) FILTER (WHERE status IN ('PENDING', 'NEEDS_REVIEW')) AS pending
                FROM point_reward
                WHERE member_id = :member AND occurred_at >= :start AND occurred_at < :end
                    AND reason IN (:reasons) AND status <> 'SKIPPED'
                GROUP BY reason
                """).param("member", memberId).param("start", start).param("end", start.plusWeeks(1))
                .param("reasons", reasons)
                .query((row, index) -> new WeeklyCount(row.getString("reason"), row.getInt("completed"),
                        row.getInt("pending"))).list();
    }

    public List<HistoryItem> history(long memberId, LocalDateTime before, long beforeId, int size) {
        return jdbc.sql("""
                SELECT id, reason, amount, occurred_at, status, skip_reason, completed_at
                FROM point_reward WHERE member_id = ?
                    AND skip_reason IS DISTINCT FROM 'ALREADY_REWARDED' AND (occurred_at, id) < (?, ?)
                ORDER BY occurred_at DESC, id DESC LIMIT ?
                """).params(memberId, before, beforeId, size)
                .query((row, index) -> new HistoryItem(row.getLong("id"), row.getString("reason"),
                        row.getLong("amount"), row.getObject("occurred_at", LocalDateTime.class),
                        row.getString("status"), row.getString("skip_reason"),
                        row.getObject("completed_at", LocalDateTime.class))).list();
    }

    public record WeeklyCount(String reason, int completed, int pending) {
    }

    public record HistoryItem(long id, String reason, long amount, LocalDateTime occurredAt, String status,
                              String skipReason, LocalDateTime completedAt) {
    }
}
