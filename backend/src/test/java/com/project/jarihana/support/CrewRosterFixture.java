package com.project.jarihana.support;

import org.springframework.jdbc.core.JdbcTemplate;

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
}
