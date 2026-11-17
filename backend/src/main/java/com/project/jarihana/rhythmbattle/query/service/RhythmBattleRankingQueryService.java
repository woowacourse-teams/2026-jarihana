package com.project.jarihana.rhythmbattle.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.rhythmbattle.query.repository.RhythmBattleRankingQueryRepository;
import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleRankingResult;
import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleSummaryResult;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

@Service
@RequiredArgsConstructor
public class RhythmBattleRankingQueryService {
    private final RhythmBattleRankingQueryRepository games;

    public RhythmBattleSummaryResult getSummary(long memberId) {
        return RhythmBattleSummaryResult.from(games.findStatistics(memberId));
    }

    // 한 페이지와 내 순위가 같은 시점의 끝난 판을 보도록 한 트랜잭션에서 읽는다.
    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public RhythmBattleRankingResult findRanking(long memberId, String cursor, int size) {
        long wins = Long.MAX_VALUE;
        long total = 0;
        long afterId = 0;
        if (cursor != null) {
            try {
                String[] parts = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8)
                        .split("\\|", -1);
                if (parts.length != 4 || !"R".equals(parts[0])) {
                    throw new IllegalArgumentException();
                }
                wins = Long.parseLong(parts[1]);
                total = Long.parseLong(parts[2]);
                afterId = Long.parseLong(parts[3]);
                if (wins < 0 || total < 1 || wins > total || afterId < 1) {
                    throw new IllegalArgumentException();
                }
            } catch (RuntimeException exception) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "랭킹 위치가 올바르지 않아요.");
            }
        }
        var rows = games.findRanking(wins, total, afterId, size + 1);
        boolean more = rows.size() > size;
        var page = rows.subList(0, Math.min(size, rows.size()));
        String next = null;
        if (more) {
            var last = page.getLast();
            next = Base64.getUrlEncoder().withoutPadding().encodeToString(
                    ("R|" + last.getWins() + "|" + last.getTotal() + "|" + last.getMemberId())
                            .getBytes(StandardCharsets.UTF_8));
        }
        return new RhythmBattleRankingResult(page.stream().map(RhythmBattleRankingResult.Item::from).toList(),
                games.findMemberRank(memberId).map(RhythmBattleRankingResult.Item::from).orElse(null), next, more);
    }
}
