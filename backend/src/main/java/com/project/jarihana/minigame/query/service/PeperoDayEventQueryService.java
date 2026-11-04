package com.project.jarihana.minigame.query.service;

import com.project.jarihana.minigame.config.PeperoDayEventProperties;
import com.project.jarihana.minigame.domain.EventSchedule;
import com.project.jarihana.minigame.domain.MinigameEvent;
import com.project.jarihana.minigame.query.repository.MinigameRunQueryRepository;
import com.project.jarihana.minigame.query.repository.dto.RankingProjection;
import com.project.jarihana.minigame.query.service.dto.EventStatusResult;
import com.project.jarihana.minigame.query.service.dto.RankingResult;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 이벤트를 보여 줄지와 순위를 서버 시각으로 정한다. 화면은 이 응답만 보고 진입점과 게임을 열고 닫는다.
 */
@Service
@RequiredArgsConstructor
public class PeperoDayEventQueryService {

    private static final MinigameEvent EVENT = MinigameEvent.PEPERO_DAY_2026;
    private static final int RANKING_SIZE = 50;

    private final MinigameRunQueryRepository minigameRunQueryRepository;
    private final PeperoDayEventProperties peperoDayEventProperties;
    private final Clock clock;

    public EventStatusResult findStatus(Long memberId) {
        LocalDateTime now = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        EventSchedule schedule = peperoDayEventProperties.schedule();
        int limit = peperoDayEventProperties.dailyAttemptLimit();
        Integer remaining = memberId == null ? null : remainingAttempts(memberId, now, limit);
        return new EventStatusResult(
                schedule.statusAt(now),
                schedule.opensAt(),
                schedule.closesAt(),
                schedule.gameRoomOpensAt(),
                schedule.inGameRoomAt(now),
                now,
                limit,
                remaining
        );
    }

    public RankingResult findRankings(Long memberId) {
        List<RankingResult.Entry> items = minigameRunQueryRepository.findTopRankings(EVENT.name(), RANKING_SIZE).stream()
                .map(PeperoDayEventQueryService::toEntry)
                .toList();
        RankingResult.Entry me = memberId == null ? null : minigameRunQueryRepository
                .findMemberRanking(EVENT.name(), memberId)
                .map(PeperoDayEventQueryService::toEntry)
                .orElse(null);
        return new RankingResult(items, me);
    }

    private int remainingAttempts(long memberId, LocalDateTime now, int limit) {
        long used = minigameRunQueryRepository.countByEventAndMemberIdAndPlayedOn(EVENT, memberId, now.toLocalDate());
        return (int) Math.max(0, limit - used);
    }

    private static RankingResult.Entry toEntry(RankingProjection projection) {
        return new RankingResult.Entry(
                projection.getRanking(),
                projection.getNickname(),
                projection.getTotalScore(),
                projection.getTotalDurationMillis()
        );
    }
}
