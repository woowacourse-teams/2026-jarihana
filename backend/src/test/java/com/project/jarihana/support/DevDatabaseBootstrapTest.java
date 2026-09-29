package com.project.jarihana.support;

import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.session.Session;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.MountableFile;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.session.jdbc.initialize-schema=never"
})
@Import(TestSupportConfig.class)
class DevDatabaseBootstrapTest {

    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17")
            .withDatabaseName("jarihana_dev")
            .withCopyFileToContainer(
                    MountableFile.forHostPath(Path.of("db/dev/bootstrap.sql").toAbsolutePath()),
                    "/docker-entrypoint-initdb.d/001-bootstrap.sql"
            );

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        POSTGRES.start();
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    private MemberRepository members;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private JdbcIndexedSessionRepository sessions;

    @Autowired
    private SignupSessionFixture signupSessions;

    @Test
    @DisplayName("초기 SQL만 적용한 PostgreSQL 17에서 스키마 검증과 회원 저장 및 조회가 성공한다")
    void validatesBootstrapSchemaAndReadsPersistedMember() {
        // Given
        Member member = Member.create("가온", 8, "bootstrap-crew", Course.BACKEND);

        // When
        Member saved = members.save(member);

        // Then
        assertThat(jdbc.queryForObject("SHOW server_version", String.class)).startsWith("17.");
        assertThat(jdbc.queryForObject("SELECT current_database()", String.class)).isEqualTo("jarihana_dev");
        assertThat(members.findById(saved.getId())).get()
                .extracting(Member::getGithubId).isEqualTo("bootstrap-crew");
    }

    @Test
    @DisplayName("자동 스키마 생성 없이 JDBC 세션 속성을 저장하고 읽은 뒤 함께 삭제한다")
    void persistsSessionAttributesAndCascadesDeletion() {
        // Given
        String sessionId = signupSessions.create("bootstrap-github");

        // When
        Session restored = sessions.findById(sessionId);

        // Then
        assertThat(restored).isNotNull();
        assertThat(restored.<String>getAttribute("signup.githubId")).isEqualTo("bootstrap-github");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM spring_session_attributes", Integer.class))
                .isEqualTo(1);
        sessions.deleteById(sessionId);
        assertThat(sessions.findById(sessionId)).isNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM spring_session_attributes", Integer.class)).isZero();
    }

    @Test
    @DisplayName("초기 스키마는 회원 정책과 피드백 마이그레이션의 제약을 포함한다")
    void enforcesMemberPolicyAndFeedbackMigrationConstraints() {
        // Given
        String insertCoach = """
                INSERT INTO member (crew_name, github_id, member_type, created_at, updated_at)
                VALUES ('코치', ?, 'COACH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """;
        jdbc.update(insertCoach, "bootstrap-coach");

        // When / Then
        assertThatThrownBy(() -> jdbc.update(insertCoach, "duplicate-coach"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uk_member_coach_name");
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO member (crew_name, github_id, member_type, course, generation, created_at, updated_at)
                VALUES ('잘못', 'invalid-profile', 'COACH', 'BACKEND', 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ck_member_profile_fields");
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO feedback (content, member_id, created_at, updated_at)
                VALUES ('feedback', -1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("fk_feedback_member_id");
    }
}
