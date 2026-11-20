package com.project.jarihana.rhythm.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.rhythm.domain.RhythmChart;
import com.project.jarihana.rhythm.domain.RhythmLevel;
import com.project.jarihana.rhythm.query.repository.RhythmRankingQueryRepository;
import com.project.jarihana.rhythm.query.service.dto.RhythmRankingResult;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;

@Service
@RequiredArgsConstructor
public class RhythmRankingQueryService {
    private final RhythmRankingQueryRepository rankings;
    private final RhythmChart chart;

    // 목록과 내 순위가 같은 기록 시점을 보도록 한 스냅샷에서 읽는다.
    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public RhythmRankingResult ranking(long memberId, RhythmLevel level, String cursor, int size) {
        long score = Long.MAX_VALUE;
        LocalDateTime finishedAt = LocalDateTime.of(1, 1, 1, 0, 0);
        long afterMemberId = 0;
        if (cursor != null) {
            try {
                String[] parts = decode(cursor);
                score = Long.parseLong(parts[1]);
                finishedAt = LocalDateTime.parse(parts[2]);
                afterMemberId = Long.parseLong(parts[3]);
                if (afterMemberId < 1 || !level.name().equals(parts[4])) {
                    throw new IllegalArgumentException();
                }
            } catch (RuntimeException exception) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "목록 위치가 올바르지 않아요.");
            }
        }
        String rulesVersion = chart.getRulesVersion();
        var rows = rankings.ranking(level.name(), rulesVersion, score, finishedAt, afterMemberId, size + 1);
        boolean more = rows.size() > size;
        var page = rows.subList(0, Math.min(size, rows.size()));
        String next = null;
        if (more) {
            var last = page.getLast();
            next = encode("S|" + last.getScore() + "|" + last.getFinishedAt() + "|" + last.getMemberId() + "|" + level.name());
        }
        return new RhythmRankingResult(page.stream().map(RhythmRankingResult.Item::from).toList(),
                rankings.memberRank(level.name(), rulesVersion, memberId).map(RhythmRankingResult.Item::from).orElse(null),
                next, more);
    }

    private String[] decode(String cursor) {
        String[] parts = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8).split("\\|", -1);
        if (parts.length != 5 || !"S".equals(parts[0])) {
            throw new IllegalArgumentException();
        }
        return parts;
    }

    private String encode(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }
}
