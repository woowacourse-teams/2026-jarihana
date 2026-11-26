package com.project.jarihana.support;

import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

/**
 * 운영에서는 명단을 저장소 밖 CSV로 넣으므로 애플리케이션에 명단 저장 API가 없다.
 * 테스트도 같은 방식으로 테이블에 직접 넣는다.
 */
public class CrewRosterFixture {

    private final JdbcTemplate jdbcTemplate;

    public CrewRosterFixture(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void register(String githubId, int generation, String course) {
        jdbcTemplate.update(
                "insert into crew_roster (github_id, generation, course) values (?, ?, ?)",
                githubId, generation, course
        );
    }

    /**
     * GitHub 계정의 회원이 확인된 소속 코드. 크루 명단으로 인증된 크루는 우아한테크코스 소속을 얻는다.
     */
    public List<String> affiliationCodes(String githubId) {
        return jdbcTemplate.queryForList("""
                select affiliation.code
                from member_affiliation membership
                         join affiliation on affiliation.id = membership.affiliation_id
                         join member on member.id = membership.member_id
                where member.github_id = ?
                order by affiliation.code
                """, String.class, githubId);
    }
}
