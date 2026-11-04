package com.project.jarihana.minigame.query.repository;

import com.project.jarihana.minigame.domain.MinigameEvent;
import com.project.jarihana.minigame.domain.MinigameRun;
import com.project.jarihana.minigame.query.repository.dto.RankingProjection;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * 순위는 회원마다 가장 좋은 끝난 판 하나만 쓴다. 점수가 높을수록, 같으면 걸린 시간이 짧을수록,
 * 그것도 같으면 먼저 끝낸 판이 위다.
 */
public interface MinigameRunQueryRepository extends Repository<MinigameRun, Long> {

    String RANKED_RUNS = """
            WITH best AS (
                SELECT DISTINCT ON (r.member_id)
                       r.member_id, r.total_score, r.total_duration_millis, r.finished_at
                FROM minigame_run r
                WHERE r.event = :event AND r.finished_at IS NOT NULL
                ORDER BY r.member_id, r.total_score DESC, r.total_duration_millis ASC, r.finished_at ASC
            ), ranked AS (
                SELECT b.member_id, b.total_score, b.total_duration_millis,
                       ROW_NUMBER() OVER (
                           ORDER BY b.total_score DESC, b.total_duration_millis ASC, b.finished_at ASC, b.member_id ASC
                       ) AS ranking
                FROM best b
            )
            SELECT ranked.ranking AS ranking,
                   ranked.member_id AS memberId,
                   m.crew_name AS nickname,
                   ranked.total_score AS totalScore,
                   ranked.total_duration_millis AS totalDurationMillis
            FROM ranked
            JOIN member m ON m.id = ranked.member_id
            """;

    long countByEventAndMemberIdAndCreatedAtGreaterThanEqual(MinigameEvent event, long memberId, LocalDateTime from);

    @Query(value = RANKED_RUNS + " ORDER BY ranked.ranking LIMIT :size", nativeQuery = true)
    List<RankingProjection> findTopRankings(@Param("event") String event, @Param("size") int size);

    @Query(value = RANKED_RUNS + " WHERE ranked.member_id = :memberId", nativeQuery = true)
    Optional<RankingProjection> findMemberRanking(@Param("event") String event, @Param("memberId") long memberId);
}
