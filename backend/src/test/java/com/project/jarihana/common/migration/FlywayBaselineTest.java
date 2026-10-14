package com.project.jarihana.common.migration;

import com.project.jarihana.support.IntegrationTestSupport;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.context.ActiveProfiles;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ActiveProfiles("dev")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "management.server.port=0",
        "management.server.address=127.0.0.1",
        "spring.application.name=jarihana"
})
class FlywayBaselineTest extends IntegrationTestSupport {

    @Autowired
    private DataSource dataSource;

    @Autowired
    private Flyway flyway;

    @Test
    @DisplayName("애플리케이션은 V1으로 스키마와 세션 테이블을 만들고 재기동 시 다시 적용하지 않는다.")
    void applicationMigratesBaselineOnlyOnce() {
        // Given
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        // When
        int appliedMigrations = flyway.migrate().migrationsExecuted;

        // Then
        assertThat(appliedMigrations).isZero();
        assertThat(jdbc.queryForObject("""
                select type from flyway_schema_history where version = '1' and success
                """, String.class)).isEqualTo("SQL");
        assertThat(jdbc.queryForList("select tablename from pg_tables where schemaname = current_schema()", String.class))
                .contains("spring_session", "spring_session_attributes", "group_event", "group_recurring_series",
                        "invitation", "invitation_acceptance");
        assertThat(jdbc.queryForList("select indexname from pg_indexes where schemaname = current_schema()", String.class))
                .contains("uk_member_coach_name", "idx_notifications_inbox", "uk_group_recurring_current_group",
                        "uk_group_event_recurring_occurrence", "idx_activity_post_date_id",
                        "idx_invitation_group_created", "idx_invitation_target_created", "idx_invitation_acceptance_member");
        assertThat(jdbc.queryForList("""
                select conname from pg_constraint where connamespace = current_schema()::regnamespace
                """, String.class)).contains("ck_member_profile_fields", "ck_notifications_payload",
                        "ck_notifications_event_type", "ck_group_event_recurring_reference",
                        "ck_registration_approval_origin", "ck_invitation_type", "ck_invitation_status");
    }

    @Test
    @DisplayName("실제 운영 스키마처럼 허용되지 않은 회원 과정은 DB에서 거절한다.")
    void rejectMemberCourseOutsideLiveSchemaValues() {
        // Given
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        // When / Then
        assertThatThrownBy(() -> jdbc.update("""
                insert into member (crew_name, generation, github_id, member_type, course, created_at, updated_at)
                values ('우주', 8, 'invalid-course', 'CREW', 'INVALID', localtimestamp, localtimestamp)
                """)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("기존 스키마는 V1을 baseline으로 등록하고 데이터를 보존한 채 다음 버전만 적용한다.")
    void existingSchemaSkipsV1AndPreservesData() throws SQLException {
        // Given
        String schema = "baseline_" + UUID.randomUUID().toString().replace("-", "");
        JdbcTemplate administrative = new JdbcTemplate(dataSource);
        administrative.execute("create schema " + schema);
        try (Connection connection = dataSource.getConnection()) {
            String originalSchema = connection.getSchema();
            try {
                connection.setSchema(schema);
                SingleConnectionDataSource isolated = new SingleConnectionDataSource(connection, true);
                new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1__baseline.sql")).execute(isolated);
                JdbcTemplate jdbc = new JdbcTemplate(isolated);
                jdbc.update("""
                        insert into member (crew_name, generation, github_id, member_type, course, created_at, updated_at)
                        values ('우주', 8, 'baseline-member', 'CREW', 'BACKEND', localtimestamp, localtimestamp)
                        """);
                jdbc.update("""
                        insert into spring_session (primary_id, session_id, creation_time, last_access_time,
                            max_inactive_interval, expiry_time, principal_name)
                        values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
                            0, 0, 1800, 9999999999999, 'baseline-member')
                        """);
                Flyway existing = Flyway.configure().dataSource(isolated).schemas(schema)
                        .locations("classpath:db/migration", "classpath:db/baseline-test")
                        .baselineOnMigrate(true).baselineVersion("1").load();

                // When
                int appliedMigrations = existing.migrate().migrationsExecuted;

                // Then
                assertThat(appliedMigrations).isEqualTo(1);
                assertThat(jdbc.queryForObject("select type from flyway_schema_history where version = '1'", String.class))
                        .isEqualTo("BASELINE");
                assertThat(jdbc.queryForObject("select type from flyway_schema_history where version = '2'", String.class))
                        .isEqualTo("SQL");
                assertThat(jdbc.queryForObject("select github_id from member", String.class)).isEqualTo("baseline-member");
                assertThat(jdbc.queryForObject("select principal_name from spring_session", String.class))
                        .isEqualTo("baseline-member");
                assertThat(jdbc.queryForObject("select count(*) from baseline_test_marker", Long.class)).isZero();
                assertThat(existing.migrate().migrationsExecuted).isZero();
            } finally {
                connection.setSchema(originalSchema);
            }
        } finally {
            administrative.execute("drop schema " + schema + " cascade");
        }
    }

    @Test
    @DisplayName("baseline을 명시적으로 켜지 않으면 이력이 없는 기존 스키마를 자동 등록하지 않는다.")
    void nonEmptySchemaRequiresExplicitBaseline() {
        // Given
        String schema = "unmanaged_" + UUID.randomUUID().toString().replace("-", "");
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("create schema " + schema);
        try {
            jdbc.execute("create table " + schema + ".existing_data (id bigint primary key)");
            Flyway unmanaged = Flyway.configure().dataSource(dataSource).schemas(schema)
                    .locations("classpath:db/migration").baselineOnMigrate(false).load();

            // When / Then
            assertThatThrownBy(unmanaged::migrate).isInstanceOf(FlywayException.class)
                    .hasMessageContaining("non-empty");
        } finally {
            jdbc.execute("drop schema " + schema + " cascade");
        }
    }
}
