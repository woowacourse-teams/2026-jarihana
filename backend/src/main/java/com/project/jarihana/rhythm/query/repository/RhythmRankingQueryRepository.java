package com.project.jarihana.rhythm.query.repository;

import com.project.jarihana.rhythm.domain.RhythmChallenge;
import com.project.jarihana.rhythm.query.repository.dto.RhythmRankingProjection;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * 난이도와 규칙 판본마다 회원별 최고 기록 한 판으로 순위를 매긴다. 같은 점수는 먼저 세운 기록이 앞선다.
 */
public interface RhythmRankingQueryRepository extends Repository<RhythmChallenge, Long> {
    String RANKED = """
            with best as (
                select distinct on (c.member_id) c.member_id, c.id as challenge_id, c.score, c.best_combo,
                    c.loop_reached, c.finished_at
                from rhythm_challenge c
                where c.status='FINISHED' and c.level=:level and c.rules_version=:rulesVersion
                order by c.member_id, c.score desc, c.finished_at asc, c.id asc
            ), ranked as (
                select b.*, m.crew_name as name, m.github_id as github_id,
                    row_number() over (order by b.score desc, b.finished_at asc, b.member_id asc) as rank
                from best b join member m on m.id=b.member_id where m.withdrawn_at is null
            )
            """;
    String COLUMNS = """
            select member_id as memberId, challenge_id as challengeId, score, best_combo as bestCombo,
                loop_reached as loopReached, finished_at as finishedAt, name, github_id as githubId, rank
            from ranked
            """;

    @Query(value = RANKED + COLUMNS + """
            where score<:score or (score=:score and finished_at>:finishedAt)
                or (score=:score and finished_at=:finishedAt and member_id>:memberId)
            order by score desc, finished_at asc, member_id asc limit :limit
            """, nativeQuery = true)
    List<RhythmRankingProjection> ranking(String level, String rulesVersion, long score, LocalDateTime finishedAt,
            long memberId, int limit);

    @Query(value = RANKED + COLUMNS + "where member_id=:memberId", nativeQuery = true)
    Optional<RhythmRankingProjection> memberRank(String level, String rulesVersion, long memberId);
}
