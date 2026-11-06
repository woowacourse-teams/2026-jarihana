package com.project.jarihana.points.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.points.config.PointPolicy;
import com.project.jarihana.points.config.PointRewardRules;
import com.project.jarihana.points.domain.PointRewardRule;
import com.project.jarihana.points.query.repository.PointQueryRepository.HistoryItem;
import com.project.jarihana.points.query.repository.PointQueryRepository.WeeklyCount;
import com.project.jarihana.points.query.repository.PointQueryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PointQueryService {
    private final PointQueryRepository repository;
    private final PointPolicy policy;
    private final PointRewardRules rules;
    private final Clock clock;

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public SummaryResult summary(long memberId) {
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDateTime week = PointPolicy.weekStart(now);
        List<PointRewardRule> weeklyRules = rules.weekly();
        List<String> reasons = weeklyRules.stream().map(PointRewardRule::code).toList();
        List<WeeklyCount> counts = repository.weeklyCounts(memberId, week, reasons);
        List<WeeklyQuota> quotas = weeklyRules.stream()
                .map(rule -> new WeeklyQuota(rule.code(), rule.label(), quota(counts, rule)))
                .toList();
        return new SummaryResult(policy.isActiveAt(now), repository.balance(memberId),
                repository.hasUnsettledRewards(memberId), quotas, week.plusWeeks(1));
    }

    public HistoryResult history(long memberId, String cursor, int size) {
        Cursor start = decode(cursor);
        List<HistoryItem> found = repository.history(memberId, start.occurredAt(), start.id(), size + 1);
        boolean hasNext = found.size() > size;
        List<HistoryItem> items = hasNext ? found.subList(0, size) : found;
        return new HistoryResult(List.copyOf(items), hasNext ? encode(items.getLast()) : null, hasNext);
    }

    private static Quota quota(List<WeeklyCount> counts, PointRewardRule rule) {
        int limit = rule.weeklyLimit();
        return counts.stream().filter(count -> count.reason().equals(rule.code())).findFirst()
                .map(count -> new Quota(limit, count.completed(), count.pending(),
                        Math.max(0, limit - count.completed() - count.pending())))
                .orElse(new Quota(limit, 0, 0, limit));
    }

    private static Cursor decode(String value) {
        if (value == null) {
            return new Cursor(LocalDateTime.of(9999, 12, 31, 0, 0), Long.MAX_VALUE);
        }
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
            String[] parts = decoded.split("\\|", -1);
            if (parts.length != 2) {
                throw new IllegalArgumentException();
            }
            LocalDateTime time = LocalDateTime.parse(parts[0]);
            long id = Long.parseLong(parts[1]);
            if (time.getYear() < 1 || time.getYear() > 9999 || id <= 0) {
                throw new IllegalArgumentException();
            }
            return new Cursor(time, id);
        } catch (IllegalArgumentException | DateTimeParseException invalid) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "포인트 내역 커서가 올바르지 않습니다.");
        }
    }

    private static String encode(HistoryItem item) {
        String value = item.occurredAt() + "|" + item.id();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private record Cursor(LocalDateTime occurredAt, long id) {
    }

    public record Quota(int limit, int completed, int pending, int remaining) {
    }

    public record WeeklyQuota(String reason, String label, Quota quota) {
    }

    public record SummaryResult(boolean enabled, long balance, boolean processing, List<WeeklyQuota> weeklyQuotas,
                                LocalDateTime resetsAt) {
        public Quota quotaFor(String reason) {
            return weeklyQuotas.stream()
                    .filter(weekly -> weekly.reason().equals(reason))
                    .findFirst().orElseThrow().quota();
        }
    }

    public record HistoryResult(List<HistoryItem> items, String nextCursor, boolean hasNext) {
    }
}
