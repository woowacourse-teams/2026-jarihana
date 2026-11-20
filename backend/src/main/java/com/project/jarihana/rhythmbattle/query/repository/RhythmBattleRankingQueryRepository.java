package com.project.jarihana.rhythmbattle.query.repository;

import com.project.jarihana.rhythmbattle.domain.RhythmBattleGame;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 끝난 대전 판으로 회원별 승, 패, 무를 모으고 누적 승수로 순위를 매긴다. 오목 랭킹과 같은 정렬 규칙을 쓴다.
 */
public interface RhythmBattleRankingQueryRepository extends Repository<RhythmBattleGame, Long> {
    String RANKING = """
            with results as (
                select host_member_id as member_id, winner_member_id, end_reason from rhythm_battle_game
                where ended_at is not null
                union all
                select guest_member_id as member_id, winner_member_id, end_reason from rhythm_battle_game
                where ended_at is not null
            ), totals as (
                select member_id, count(*) as total,
                    count(*) filter (where winner_member_id = member_id) as wins,
                    count(*) filter (where end_reason = 'DRAW') as draws
                from results group by member_id
            ), ranked as (
                select t.*, t.total - t.wins - t.draws as losses, m.crew_name as name, m.github_id as githubId,
                    row_number() over (order by t.wins desc, t.total asc, t.member_id asc) as rank
                from totals t join member m on m.id = t.member_id where m.withdrawn_at is null
            )
            """;

    @Query(value = """
            select count(*) as total,
                count(*) filter (where winner_member_id = :memberId) as wins,
                count(*) filter (where end_reason = 'DRAW') as draws
            from rhythm_battle_game
            where ended_at is not null and (host_member_id = :memberId or guest_member_id = :memberId)
            """, nativeQuery = true)
    Statistics findStatistics(long memberId);

    @Query(value = RANKING + """
            select * from ranked where wins < :wins or (wins = :wins and total > :total)
                or (wins = :wins and total = :total and member_id > :memberId)
            order by wins desc, total asc, member_id asc limit :limit
            """, nativeQuery = true)
    List<Ranking> findRanking(long wins, long total, long memberId, int limit);

    @Query(value = RANKING + "select * from ranked where member_id = :memberId", nativeQuery = true)
    Optional<Ranking> findMemberRank(long memberId);

    interface Statistics {
        long getTotal();

        long getWins();

        long getDraws();
    }

    interface Ranking extends Statistics {
        long getMemberId();

        long getRank();

        long getLosses();

        String getName();

        String getGithubId();
    }
}
