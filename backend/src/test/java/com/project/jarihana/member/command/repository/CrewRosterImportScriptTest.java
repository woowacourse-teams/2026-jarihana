package com.project.jarihana.member.command.repository;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.Container.ExecResult;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.MountableFile;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 운영자가 쓰는 크루 명단 적재 SQL을 실제 psql로 실행해 확인한다.
 *
 * <p>실제 명단은 저장소에 두지 않으므로 가짜 CSV로 같은 형식을 재현한다.
 */
class CrewRosterImportScriptTest {

    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer("postgres:17");
    private static final String SCRIPT_IN_CONTAINER = "/tmp/crew-roster-import.sql";
    private static JdbcTemplate jdbc;

    @BeforeAll
    static void startDatabase() {
        DATABASE.start();
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword()
        );
        Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").load().migrate();
        jdbc = new JdbcTemplate(dataSource);
        DATABASE.copyFileToContainer(
                MountableFile.forHostPath(Path.of("db", "operations", "crew-roster-import.sql")),
                SCRIPT_IN_CONTAINER
        );
        DATABASE.copyFileToContainer(
                MountableFile.forClasspathResource("crew-roster/roster-sample.csv"), "/tmp/roster-sample.csv"
        );
        DATABASE.copyFileToContainer(
                MountableFile.forClasspathResource("crew-roster/roster-invalid-course.csv"), "/tmp/roster-invalid.csv"
        );
    }

    @AfterAll
    static void stopDatabase() {
        DATABASE.stop();
    }

    @BeforeEach
    void clean() {
        jdbc.update("truncate table crew_roster, member restart identity cascade");
    }

    @DisplayName("명단 CSV의 GitHub 숫자 id, 기수, 과정만 저장하고 닉네임과 로그인 이름은 저장하지 않는다.")
    @Test
    void importRosterKeepsOnlyVerificationColumns() throws Exception {
        // When
        ExecResult result = importRoster("/tmp/roster-sample.csv");

        // Then
        assertThat(result.getExitCode()).as(result.getStderr()).isZero();
        assertThat(jdbc.queryForList("select github_id, generation, course from crew_roster order by github_id"))
                .containsExactly(
                        Map.of("github_id", "1001", "generation", 8, "course", "BACKEND"),
                        Map.of("github_id", "1002", "generation", 8, "course", "FRONTEND"),
                        Map.of("github_id", "1003", "generation", 7, "course", "ANDROID"),
                        Map.of("github_id", "1004", "generation", 8, "course", "BACKEND"),
                        Map.of("github_id", "1005", "generation", 6, "course", "BACKEND")
                );
        assertThat(jdbc.queryForList(
                "select column_name from information_schema.columns where table_name = 'crew_roster'", String.class
        )).doesNotContain("crew_name", "github_login");
    }

    @DisplayName("같은 명단을 다시 넣으면 GitHub 숫자 id 기준으로 기수와 과정을 갱신한다.")
    @Test
    void reimportUpdatesExistingRows() throws Exception {
        // Given
        jdbc.update("insert into crew_roster (github_id, generation, course) values ('1001', 7, 'ANDROID')");

        // When
        ExecResult result = importRoster("/tmp/roster-sample.csv");

        // Then
        assertThat(result.getExitCode()).as(result.getStderr()).isZero();
        assertThat(jdbc.queryForMap("select generation, course from crew_roster where github_id = '1001'"))
                .isEqualTo(Map.of("generation", 8, "course", "BACKEND"));
        assertThat(jdbc.queryForObject("select count(*) from crew_roster", Integer.class)).isEqualTo(5);
    }

    @DisplayName("이미 가입한 기본 멤버, 부트캠프 회원, 현직자 중 명단에 있는 사람은 닉네임을 유지한 채 크루가 된다.")
    @Test
    void importVerifiesExistingNonCrewMembers() throws Exception {
        // Given
        insertBasicMember("도담", "1001");
        jdbc.update("""
                insert into member (crew_name, github_id, member_type, bootcamp_name, bootcamp_status, field,
                                    created_at, updated_at)
                values ('바다', '1002', 'BOOTCAMP', 'SSAFY', 'COMPLETED', 'FRONTEND', localtimestamp, localtimestamp)
                """);
        jdbc.update("""
                insert into member (crew_name, github_id, member_type, field, career, company_name, company_visible,
                                    created_at, updated_at)
                values ('하나', '1003', 'PROFESSIONAL', 'BACKEND', 'UNDER_1', '자리하나', true,
                        localtimestamp, localtimestamp)
                """);
        insertBasicMember("구름", "9999");

        // When
        ExecResult result = importRoster("/tmp/roster-sample.csv");

        // Then
        assertThat(result.getExitCode()).as(result.getStderr()).isZero();
        assertThat(jdbc.queryForList("""
                select github_id, crew_name, member_type, generation, course
                from member order by github_id
                """)).containsExactly(
                Map.of("github_id", "1001", "crew_name", "도담", "member_type", "CREW", "generation", 8, "course", "BACKEND"),
                Map.of("github_id", "1002", "crew_name", "바다", "member_type", "CREW", "generation", 8, "course", "FRONTEND"),
                Map.of("github_id", "1003", "crew_name", "하나", "member_type", "CREW", "generation", 7, "course", "ANDROID"),
                row("9999", "구름", "MEMBER")
        );
        assertThat(jdbc.queryForObject("""
                select count(*) from member
                where bootcamp_name is not null or field is not null or career is not null or company_name is not null
                """, Integer.class)).isZero();
    }

    @DisplayName("이미 크루나 코치인 회원은 명단과 달라도 바꾸지 않는다.")
    @Test
    void importKeepsExistingCrewAndCoach() throws Exception {
        // Given
        jdbc.update("""
                insert into member (crew_name, generation, github_id, member_type, course, created_at, updated_at)
                values ('가온', 5, '1001', 'CREW', 'ANDROID', localtimestamp, localtimestamp)
                """);
        jdbc.update("""
                insert into member (crew_name, github_id, member_type, created_at, updated_at)
                values ('코치', '1002', 'COACH', localtimestamp, localtimestamp)
                """);
        var before = jdbc.queryForList("select * from member order by id");

        // When
        ExecResult result = importRoster("/tmp/roster-sample.csv");

        // Then
        assertThat(result.getExitCode()).as(result.getStderr()).isZero();
        assertThat(jdbc.queryForList("select * from member order by id")).isEqualTo(before);
    }

    @DisplayName("같은 기수에 같은 닉네임의 크루가 있으면 그 회원은 크루로 바꾸지 않고 나머지는 계속 적재한다.")
    @Test
    void importSkipsMembersWhoseNameCollides() throws Exception {
        // Given
        jdbc.update("""
                insert into member (crew_name, generation, github_id, member_type, course, created_at, updated_at)
                values ('도담', 8, 'existing-crew', 'CREW', 'BACKEND', localtimestamp, localtimestamp)
                """);
        insertBasicMember("도담", "1001");
        insertBasicMember("구름", "1004");

        // When
        ExecResult result = importRoster("/tmp/roster-sample.csv");

        // Then
        assertThat(result.getExitCode()).as(result.getStderr()).isZero();
        assertThat(memberTypeOf("1001")).isEqualTo("MEMBER");
        assertThat(memberTypeOf("1004")).isEqualTo("CREW");
        assertThat(jdbc.queryForObject("select count(*) from crew_roster", Integer.class)).isEqualTo(5);
    }

    @DisplayName("CSV에 잘못된 줄이 하나라도 있으면 명단과 회원을 하나도 바꾸지 않는다.")
    @Test
    void invalidRowRollsBackWholeImport() throws Exception {
        // Given
        insertBasicMember("도담", "2001");

        // When
        ExecResult result = importRoster("/tmp/roster-invalid.csv");

        // Then
        assertThat(result.getExitCode()).isNotZero();
        assertThat(jdbc.queryForObject("select count(*) from crew_roster", Integer.class)).isZero();
        assertThat(memberTypeOf("2001")).isEqualTo("MEMBER");
    }

    private ExecResult importRoster(String csvInContainer) throws Exception {
        String command = "psql -U %s -d %s -f %s < %s".formatted(
                DATABASE.getUsername(), DATABASE.getDatabaseName(), SCRIPT_IN_CONTAINER, csvInContainer
        );
        return DATABASE.execInContainer("sh", "-c", command);
    }

    private void insertBasicMember(String crewName, String githubId) {
        jdbc.update("""
                insert into member (crew_name, github_id, member_type, created_at, updated_at)
                values (?, ?, 'MEMBER', localtimestamp, localtimestamp)
                """, crewName, githubId);
    }

    private String memberTypeOf(String githubId) {
        return jdbc.queryForObject("select member_type from member where github_id = ?", String.class, githubId);
    }

    private static Map<String, Object> row(String githubId, String crewName, String memberType) {
        Map<String, Object> row = new HashMap<>();
        row.put("github_id", githubId);
        row.put("crew_name", crewName);
        row.put("member_type", memberType);
        row.put("generation", null);
        row.put("course", null);
        return row;
    }
}
