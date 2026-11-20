package com.project.jarihana.gomoku.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.gomoku.query.repository.GomokuGameQueryRepository;
import com.project.jarihana.gomoku.query.service.dto.GomokuHistoryResult;
import com.project.jarihana.gomoku.query.service.dto.GomokuRankingResult;
import com.project.jarihana.gomoku.query.service.dto.GomokuStatisticsResult;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;

@Service
@RequiredArgsConstructor
public class GomokuHistoryQueryService {
    private final GomokuGameQueryRepository games;

    public GomokuStatisticsResult statistics(long memberId) {
        return GomokuStatisticsResult.from(games.statistics(memberId));
    }

    public GomokuHistoryResult history(long memberId, String cursor, int size) {
        LocalDateTime before = LocalDateTime.of(9999, 12, 31, 23, 59, 59);
        long beforeId = Long.MAX_VALUE;
        if (cursor != null) {
            try {
                String[] parts = decode(cursor, "H", 3);
                before = LocalDateTime.parse(parts[1]);
                beforeId = Long.parseLong(parts[2]);
                if (beforeId < 1 || before.getYear() < 1 || before.getYear() > 9999) throw new IllegalArgumentException();
            } catch (RuntimeException exception) { throw invalidCursor(); }
        }
        var rows = games.history(memberId, before, beforeId, size + 1);
        boolean more = rows.size() > size;
        var page = rows.subList(0, Math.min(size, rows.size()));
        String next = more ? encode("H|" + page.getLast().getEndedAt() + "|" + page.getLast().getId()) : null;
        return new GomokuHistoryResult(page.stream().map(GomokuHistoryResult.Item::from).toList(), next, more);
    }

    // The page and the caller's rank must describe the same completed-game snapshot.
    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public GomokuRankingResult ranking(long memberId, String cursor, int size) {
        long wins = Long.MAX_VALUE, total = 0, afterId = 0;
        if (cursor != null) {
            try {
                String[] parts = decode(cursor, "R", 4);
                wins = Long.parseLong(parts[1]);
                total = Long.parseLong(parts[2]);
                afterId = Long.parseLong(parts[3]);
                if (wins < 0 || total < 1 || wins > total || afterId < 1) throw new IllegalArgumentException();
            } catch (RuntimeException exception) { throw invalidCursor(); }
        }
        var rows = games.ranking(wins, total, afterId, size + 1);
        boolean more = rows.size() > size;
        var page = rows.subList(0, Math.min(size, rows.size()));
        String next = null;
        if (more) {
            var last = page.getLast();
            next = encode("R|" + last.getWins() + "|" + last.getTotal() + "|" + last.getMemberId());
        }
        return new GomokuRankingResult(page.stream().map(GomokuRankingResult.Item::from).toList(),
                games.memberRank(memberId).map(GomokuRankingResult.Item::from).orElse(null), next, more);
    }

    private String[] decode(String cursor, String kind, int count) {
        String[] parts = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8).split("\\|", -1);
        if (parts.length != count || !kind.equals(parts[0])) throw new IllegalArgumentException();
        return parts;
    }

    private String encode(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private BusinessException invalidCursor() {
        return new BusinessException(ErrorCode.INVALID_PARAMETER, "목록 위치가 올바르지 않아요.");
    }
}
