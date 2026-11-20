package com.project.jarihana.gomoku.query.repository;

import com.project.jarihana.gomoku.domain.GomokuGame;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface GomokuGameQueryRepository extends Repository<GomokuGame, Long> {
    String RANKING = """
            with results as (
                select host_member_id as member_id, winner_member_id, end_reason from gomoku_game where ended_at is not null
                union all
                select guest_member_id as member_id, winner_member_id, end_reason from gomoku_game where ended_at is not null
            ), totals as (
                select member_id, count(*) as total,
                    count(*) filter (where winner_member_id=member_id) as wins,
                    count(*) filter (where end_reason='DRAW') as draws
                from results group by member_id
            ), ranked as (
                select t.*, t.total-t.wins-t.draws as losses, m.crew_name as name, m.github_id as githubId,
                    row_number() over (order by t.wins desc, t.total asc, t.member_id asc) as rank
                from totals t join member m on m.id=t.member_id where m.withdrawn_at is null
            )
            """;

    @Query(value = """
            select count(*) as total,
                count(*) filter (where winner_member_id=:memberId) as wins,
                count(*) filter (where end_reason='DRAW') as draws
            from gomoku_game where ended_at is not null and (host_member_id=:memberId or guest_member_id=:memberId)
            """, nativeQuery = true)
    Statistics statistics(long memberId);

    @Query(value = """
            select g.id, g.rule, g.end_reason as endReason, g.ended_at as endedAt,
                case when g.host_member_id=:memberId then g.guest_name else g.host_name end as opponentName,
                m.github_id as opponentGithubId,
                case when g.end_reason='DRAW' then 'DRAW' when g.winner_member_id=:memberId then 'WIN' else 'LOSE' end as result
            from gomoku_game g
            join member m on m.id=case when g.host_member_id=:memberId then g.guest_member_id else g.host_member_id end
            where g.ended_at is not null and (g.host_member_id=:memberId or g.guest_member_id=:memberId)
                and (g.ended_at<:before or (g.ended_at=:before and g.id<:beforeId))
            order by g.ended_at desc, g.id desc limit :limit
            """, nativeQuery = true)
    List<History> history(long memberId, LocalDateTime before, long beforeId, int limit);

    @Query(value = RANKING + """
            select * from ranked where wins<:wins or (wins=:wins and total>:total)
                or (wins=:wins and total=:total and member_id>:memberId)
            order by wins desc,total asc,member_id asc limit :limit
            """, nativeQuery = true)
    List<Ranking> ranking(long wins, long total, long memberId, int limit);

    @Query(value = RANKING + "select * from ranked where member_id=:memberId", nativeQuery = true)
    Optional<Ranking> memberRank(long memberId);

    interface Statistics {
        long getTotal();
        long getWins();
        long getDraws();
    }

    interface History {
        long getId();
        String getOpponentName();
        String getOpponentGithubId();
        String getResult();
        String getRule();
        String getEndReason();
        LocalDateTime getEndedAt();
    }

    interface Ranking extends Statistics {
        long getMemberId();
        long getRank();
        String getName();
        String getGithubId();
    }
}
