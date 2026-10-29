package com.project.jarihana.common.migration;

import com.project.jarihana.support.IntegrationTestSupport;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.context.ActiveProfiles;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
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

    private int migrationCountIncludingMemberAffiliation(int baseCount) {
        return baseCount + (new ClassPathResource("db/migration/V11__member_affiliation.sql").exists() ? 1 : 0);
    }

    @Test
    @DisplayName("V12는 기존 구독과 구버전 INSERT를 미지원 버전으로 보존하고 기존 스키마 이력을 유지한다.")
    void addWorkerClientVersionAfterV10() throws SQLException {
        // Given
        String schema = "subscription_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        JdbcTemplate administrative = new JdbcTemplate(dataSource);
        administrative.execute("create schema " + schema);
        try (Connection connection = dataSource.getConnection()) {
            String originalSchema = connection.getSchema();
            try {
                connection.setSchema(schema);
                SingleConnectionDataSource isolated = new SingleConnectionDataSource(connection, true);
                Flyway.configure().dataSource(isolated).schemas(schema)
                        .locations("classpath:db/migration").target("10").load().migrate();
                JdbcTemplate jdbc = new JdbcTemplate(isolated);
                jdbc.update("""
                        insert into member (crew_name, generation, github_id, member_type, course, created_at, updated_at)
                        values ('우주', 8, 'subscription-upgrade', 'CREW', 'BACKEND', localtimestamp, localtimestamp)
                        """);
                String oldInsert = """
                        insert into push_subscriptions (member_id, endpoint, p256dh, auth, enabled, generation,
                            last_seen_at, created_at, updated_at)
                        select id, ?, 'public-key', 'auth-key', true, 1, localtimestamp, localtimestamp, localtimestamp from member
                        """;
                jdbc.update(oldInsert, "https://fcm.googleapis.com/existing");
                var history = jdbc.queryForList("select * from flyway_schema_history order by installed_rank");
                var oldRows = jdbc.queryForList("select id, member_id, endpoint, generation from push_subscriptions");
                Flyway upgraded = Flyway.configure().dataSource(isolated).schemas(schema)
                        .locations("classpath:db/migration").target("12").load();
                // When
                int applied = upgraded.migrate().migrationsExecuted;
                jdbc.update(oldInsert, "https://fcm.googleapis.com/old-app-insert");
                // Then
                assertThat(applied).isEqualTo(migrationCountIncludingMemberAffiliation(1));
                assertThat(jdbc.queryForList("select * from flyway_schema_history where version not in ('11', '12') order by installed_rank"))
                        .isEqualTo(history);
                assertThat(jdbc.queryForList("select id, member_id, endpoint, generation from push_subscriptions where endpoint like '%/existing'"))
                        .isEqualTo(oldRows);
                assertThat(jdbc.queryForList("select client_version from push_subscriptions", Integer.class)).containsExactly(1, 1);
                upgraded.validate();
                assertThat(upgraded.migrate().migrationsExecuted).isZero();
            } finally {
                connection.setSchema(originalSchema);
            }
        } finally {
            administrative.execute("drop schema " + schema + " cascade");
        }
    }

    @Test
    @DisplayName("V14~V16은 기존 그룹 이미지와 구버전 INSERT, 기존 스키마 이력을 보존한다.")
    void addSparringAfterV13PreservesGroupImages() throws SQLException {
        // Given
        String schema = "sparring_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        JdbcTemplate administrative = new JdbcTemplate(dataSource);
        administrative.execute("create schema " + schema);
        try (Connection connection = dataSource.getConnection()) {
            String originalSchema = connection.getSchema();
            try {
                connection.setSchema(schema);
                SingleConnectionDataSource isolated = new SingleConnectionDataSource(connection, true);
                Flyway.configure().dataSource(isolated).schemas(schema)
                        .locations("classpath:db/migration").target("13").load().migrate();
                JdbcTemplate jdbc = new JdbcTemplate(isolated);
                jdbc.update("""
                        insert into groups (id, name, introduction, status, type, meeting_type, created_at, updated_at)
                        values (1, '이미지 모임', '기존 이미지 보존', 'ACTIVE', 'STUDY', 'ONLINE', localtimestamp, localtimestamp)
                        """);
                String oldUploadInsert = """
                        insert into image_upload (id, file_name, content_type, file_size, image_key, expires_at,
                            status, attached_group_id, created_at, updated_at)
                        values (?, 'photo.png', 'image/png', 100, ?, localtimestamp + interval '1 day',
                            'ATTACHED', 1, localtimestamp, localtimestamp)
                        """;
                String oldReferenceInsert = """
                        insert into image_reference (image_upload_id, reference_type, owner_id, group_id, created_at, updated_at)
                        values (?, 'GROUP_REPRESENTATIVE', 1, 1, localtimestamp, localtimestamp)
                        """;
                UUID existingUpload = UUID.randomUUID();
                jdbc.update(oldUploadInsert, existingUpload, "groups/1/existing.png");
                jdbc.update(oldReferenceInsert, existingUpload);
                var uploads = jdbc.queryForList("select id, image_key, status, attached_group_id from image_upload");
                var references = jdbc.queryForList("select * from image_reference");
                var history = jdbc.queryForList("select * from flyway_schema_history order by installed_rank");
                Flyway upgraded = Flyway.configure().dataSource(isolated).schemas(schema)
                        .locations("classpath:db/migration").load();

                // When
                int applied = upgraded.migrate().migrationsExecuted;

                // Then
                assertThat(applied).isEqualTo(3);
                assertThat(jdbc.queryForList("select id, image_key, status, attached_group_id from image_upload"))
                        .isEqualTo(uploads);
                assertThat(jdbc.queryForList("select * from image_reference")).isEqualTo(references);
                assertThat(jdbc.queryForList("select * from flyway_schema_history where version not in ('14', '15', '16') order by installed_rank"))
                        .isEqualTo(history);
                UUID oldAppUpload = UUID.randomUUID();
                jdbc.update(oldUploadInsert, oldAppUpload, "groups/1/old-app.png");
                jdbc.update(oldReferenceInsert, oldAppUpload);
                assertThat(jdbc.queryForObject("select count(*) from image_upload where attached_group_id = 1 and attached_sparring_id is null", Long.class))
                        .isEqualTo(2L);
                assertThat(jdbc.queryForObject("select count(*) from image_reference where reference_type = 'GROUP_REPRESENTATIVE' and group_id = 1", Long.class))
                        .isEqualTo(2L);
                upgraded.validate();
                assertThat(upgraded.migrate().migrationsExecuted).isZero();
            } finally {
                connection.setSchema(originalSchema);
            }
        } finally {
            administrative.execute("drop schema " + schema + " cascade");
        }
    }

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
    @DisplayName("Flyway는 활동 기록 댓글과 반응 테이블, 인덱스와 하트 전용 제약을 생성한다.")
    void applicationMigratesActivityPostInteractions() {
        // Given
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        // When
        int appliedMigrations = flyway.migrate().migrationsExecuted;

        // Then
        assertThat(appliedMigrations).isZero();
        assertThat(jdbc.queryForObject("""
                select type from flyway_schema_history where version = '2' and success
                """, String.class)).isEqualTo("SQL");
        assertThat(jdbc.queryForList("select tablename from pg_tables where schemaname = current_schema()", String.class))
                .contains("activity_post_comment", "activity_post_reaction", "activity_post_comment_reaction");
        assertThat(jdbc.queryForList("select indexname from pg_indexes where schemaname = current_schema()", String.class))
                .contains("idx_activity_post_comment_post_created_id", "uk_activity_post_reaction_post_member_emoji",
                        "uk_activity_post_comment_reaction_comment_member_emoji");
        assertThat(jdbc.queryForObject("""
                select type from flyway_schema_history where version = '3' and success
                """, String.class)).isEqualTo("SQL");
        assertThat(jdbc.queryForList("""
                select conname from pg_constraint where connamespace = current_schema()::regnamespace
                """, String.class)).contains("ck_activity_post_reaction_emoji",
                        "ck_activity_post_comment_reaction_emoji");
    }

    @Test
    @DisplayName("Flyway는 기존 알림 사건 종류를 유지한 채 활동 기록 댓글과 좋아요 알림을 허용한다.")
    void applicationMigratesActivityPostCommentNotificationType() {
        // Given
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        // When
        int appliedMigrations = flyway.migrate().migrationsExecuted;

        // Then
        assertThat(appliedMigrations).isZero();
        assertThat(jdbc.queryForObject("""
                select type from flyway_schema_history where version = '6' and success
                """, String.class)).isEqualTo("SQL");
        assertThat(jdbc.queryForObject("""
                select pg_get_constraintdef(oid) from pg_constraint
                where conname = 'ck_notifications_event_type' and connamespace = current_schema()::regnamespace
                """, String.class)).contains("GROUP_CREATED", "REGISTRATION_SUBMITTED", "PARTICIPANT_JOINED",
                "REGISTRATION_APPROVED", "REGISTRATION_REJECTED", "REGISTRATION_SYSTEM_REJECTED", "INVITATION_RECEIVED",
                "ACTIVITY_POST_COMMENTED", "ACTIVITY_POST_REACTED");
    }

    @Test
    @DisplayName("Flyway는 인프라가 관리하는 SQL 통계 확장을 설치하지 않는다.")
    void applicationDoesNotInstallQueryStatistics() {
        // Given
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        // When
        int appliedMigrations = flyway.migrate().migrationsExecuted;

        // Then
        assertThat(appliedMigrations).isZero();
        assertThat(jdbc.queryForObject("""
                select count(*) from pg_extension
                where extname = 'pg_stat_statements' and extnamespace = 'public'::regnamespace
                """, Integer.class)).isZero();
        assertThat(jdbc.queryForObject("""
                select count(*) from flyway_schema_history where version = '5'
                """, Integer.class)).isZero();
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
    @DisplayName("Flyway는 부트캠프와 현직자 회원의 소속 정보를 저장하고 기존 크루, 코치 저장 방식은 그대로 허용한다.")
    void applicationMigratesMemberAffiliation() {
        // Given
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        // When
        jdbc.update("""
                insert into member (crew_name, generation, github_id, member_type, course, created_at, updated_at)
                values ('우주', 8, 'legacy-crew', 'CREW', 'BACKEND', localtimestamp, localtimestamp)
                """);
        jdbc.update("""
                insert into member (crew_name, github_id, member_type, created_at, updated_at)
                values ('코치', 'legacy-coach', 'COACH', localtimestamp, localtimestamp)
                """);
        jdbc.update("""
                insert into member (crew_name, github_id, member_type, bootcamp_name, bootcamp_status,
                                    bootcamp_cohort, field, created_at, updated_at)
                values ('도담', 'bootcamp-member', 'BOOTCAMP', 'SSAFY', 'IN_PROGRESS', '12기', 'BACKEND',
                        localtimestamp, localtimestamp)
                """);
        jdbc.update("""
                insert into member (crew_name, github_id, member_type, field, career, company_name,
                                    company_visible, created_at, updated_at)
                values ('하나', 'professional-member', 'PROFESSIONAL', 'FRONTEND', 'YEARS_1_3', '자리하나', true,
                        localtimestamp, localtimestamp)
                """);

        // Then
        assertThat(jdbc.queryForObject("select count(*) from member", Integer.class)).isEqualTo(4);
        assertThat(jdbc.queryForList("select indexname from pg_indexes where schemaname = current_schema()", String.class))
                .contains("uk_member_coach_name", "uk_member_non_crew_name");
    }

    @Test
    @DisplayName("회원 유형별 소속 정보가 맞지 않으면 DB에서 거절한다.")
    void rejectMemberAffiliationOutsideMemberType() {
        // Given
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        // When / Then
        assertThatThrownBy(() -> jdbc.update("""
                insert into member (crew_name, generation, github_id, member_type, course, bootcamp_name,
                                    created_at, updated_at)
                values ('우주', 8, 'crew-with-bootcamp', 'CREW', 'BACKEND', 'SSAFY', localtimestamp, localtimestamp)
                """)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("""
                insert into member (crew_name, github_id, member_type, bootcamp_name, bootcamp_status,
                                    created_at, updated_at)
                values ('도담', 'bootcamp-without-field', 'BOOTCAMP', 'SSAFY', 'COMPLETED',
                        localtimestamp, localtimestamp)
                """)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("""
                insert into member (crew_name, github_id, member_type, field, career, company_name,
                                    created_at, updated_at)
                values ('하나', 'company-without-visibility', 'PROFESSIONAL', 'DESIGN', 'UNDER_1', '자리하나',
                        localtimestamp, localtimestamp)
                """)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("""
                insert into member (crew_name, github_id, member_type, field, career, created_at, updated_at)
                values ('하나', 'invalid-career', 'PROFESSIONAL', 'DESIGN', 'INVALID', localtimestamp, localtimestamp)
                """)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("코치, 부트캠프, 현직자 회원끼리는 같은 닉네임을 DB에서 거절한다.")
    void rejectDuplicatedNonCrewName() {
        // Given
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.update("""
                insert into member (crew_name, github_id, member_type, created_at, updated_at)
                values ('도담', 'coach-member', 'COACH', localtimestamp, localtimestamp)
                """);

        // When / Then
        assertThatThrownBy(() -> jdbc.update("""
                insert into member (crew_name, github_id, member_type, field, career, created_at, updated_at)
                values ('도담', 'duplicated-professional', 'PROFESSIONAL', 'BACKEND', 'UNDER_1',
                        localtimestamp, localtimestamp)
                """)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("기존 스키마는 V1을 baseline으로 등록하고 후속 migration을 적용해도 데이터를 보존한다.")
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
                assertThat(appliedMigrations).isEqualTo(migrationCountIncludingMemberAffiliation(13));
                assertThat(jdbc.queryForObject("select type from flyway_schema_history where version = '1'", String.class))
                        .isEqualTo("BASELINE");
                assertThat(jdbc.queryForObject("select type from flyway_schema_history where version = '2'", String.class))
                        .isEqualTo("SQL");
                assertThat(jdbc.queryForObject("select type from flyway_schema_history where version = '3'", String.class))
                        .isEqualTo("SQL");
                assertThat(jdbc.queryForObject("select type from flyway_schema_history where version = '4'", String.class))
                        .isEqualTo("SQL");
                assertThat(jdbc.queryForObject("select type from flyway_schema_history where version = '6'", String.class))
                        .isEqualTo("SQL");
                assertThat(jdbc.queryForObject("select type from flyway_schema_history where version = '7'", String.class))
                        .isEqualTo("SQL");
                assertThat(jdbc.queryForList("select tablename from pg_tables where schemaname = current_schema()", String.class))
                        .contains("chat_room", "chat_message", "chat_read_state", "announcements",
                                "proposal", "proposal_interest", "proposal_comment");
                assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '8'", String.class))
                        .isEqualTo("V8__group_chat.sql");
                assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '12'", String.class))
                        .isEqualTo("V12__push_subscription_client_version.sql");
                assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '13'", String.class))
                        .isEqualTo("V13__group_announcements.sql");
                assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '10'", String.class))
                        .isEqualTo("V10__meeting_proposal.sql");
                assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '11'", String.class))
                        .isEqualTo("V11__member_affiliation.sql");
                assertThat(jdbc.queryForObject("select type from flyway_schema_history where version = '999999'", String.class))
                        .isEqualTo("SQL");
                assertThat(jdbc.queryForList("select tablename from pg_tables where schemaname = current_schema()", String.class))
                        .contains("activity_post_comment", "activity_post_reaction", "activity_post_comment_reaction",
                                "worker_authority", "announcements");
                assertThat(jdbc.queryForList("select tablename from pg_tables where schemaname = current_schema()", String.class))
                        .contains("image_reference", "image_deletion_task", "image_promotion_task");
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
    @DisplayName("기존 V6 DB에 worker 테이블을 추가해도 회원 데이터와 기존 마이그레이션 이력을 보존한다.")
    void addWorkerAuthorityAfterExistingDevMigrations() throws SQLException {
        // Given
        String schema = "worker_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        JdbcTemplate administrative = new JdbcTemplate(dataSource);
        administrative.execute("create schema " + schema);
        try (Connection connection = dataSource.getConnection()) {
            String originalSchema = connection.getSchema();
            try {
                connection.setSchema(schema);
                SingleConnectionDataSource isolated = new SingleConnectionDataSource(connection, true);
                Flyway.configure().dataSource(isolated).schemas(schema)
                        .locations("classpath:db/migration").target("6").load().migrate();
                JdbcTemplate jdbc = new JdbcTemplate(isolated);
                jdbc.update("""
                        insert into member (crew_name, generation, github_id, member_type, course, created_at, updated_at)
                        values ('우주', 8, 'worker-upgrade-member', 'CREW', 'BACKEND', localtimestamp, localtimestamp)
                        """);
                var history = jdbc.queryForList("select * from flyway_schema_history order by installed_rank");
                Flyway upgraded = Flyway.configure().dataSource(isolated).schemas(schema)
                        .locations("classpath:db/migration").load();

                // When
                int appliedMigrations = upgraded.migrate().migrationsExecuted;

                // Then
                assertThat(appliedMigrations).isEqualTo(migrationCountIncludingMemberAffiliation(8));
                assertThat(jdbc.queryForList("select * from flyway_schema_history where version not in ('7', '8', '10', '11', '12', '13', '14', '15', '16') order by installed_rank"))
                        .isEqualTo(history);
                assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '4'", String.class))
                        .isEqualTo("V4__image_lifecycle.sql");
                assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '7'", String.class))
                        .isEqualTo("V7__worker_authority.sql");
                assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '8'", String.class))
                        .isEqualTo("V8__group_chat.sql");
                assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '12'", String.class))
                        .isEqualTo("V12__push_subscription_client_version.sql");
                assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '13'", String.class))
                        .isEqualTo("V13__group_announcements.sql");
                assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '10'", String.class))
                        .isEqualTo("V10__meeting_proposal.sql");
                assertThat(jdbc.queryForObject("select count(*) from worker_authority", Long.class)).isZero();
                assertThat(jdbc.queryForObject("select github_id from member", String.class))
                        .isEqualTo("worker-upgrade-member");
                assertThat(upgraded.migrate().migrationsExecuted).isZero();
            } finally {
                connection.setSchema(originalSchema);
            }
        } finally {
            administrative.execute("drop schema " + schema + " cascade");
        }
    }

    @Test
    @DisplayName("이미 V10을 적용한 DB에 공지를 추가해도 기존 제안 데이터와 이력을 보존한다.")
    void addAnnouncementsAfterExistingV10(@TempDir Path previousMigrations) throws SQLException, IOException {
        // Given
        for (String file : new String[]{"V1__baseline.sql", "V2__activity_post_comment_reaction.sql",
                "V3__activity_post_reaction_heart_only.sql", "V4__image_lifecycle.sql",
                "V6__activity_post_interaction_notification.sql", "V7__worker_authority.sql",
                "V8__group_chat.sql", "V10__meeting_proposal.sql"}) {
            try (var input = new ClassPathResource("db/migration/" + file).getInputStream()) {
                Files.copy(input, previousMigrations.resolve(file));
            }
        }
        String schema = "announcement_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        JdbcTemplate administrative = new JdbcTemplate(dataSource);
        administrative.execute("create schema " + schema);
        try (Connection connection = dataSource.getConnection()) {
            String originalSchema = connection.getSchema();
            try {
                connection.setSchema(schema);
                SingleConnectionDataSource isolated = new SingleConnectionDataSource(connection, true);
                Flyway.configure().dataSource(isolated).schemas(schema)
                        .locations("filesystem:" + previousMigrations).load().migrate();
                JdbcTemplate jdbc = new JdbcTemplate(isolated);
                jdbc.update("""
                        insert into member (crew_name, generation, github_id, member_type, course, created_at, updated_at)
                        values ('우주', 8, 'announcement-upgrade-member', 'CREW', 'BACKEND', localtimestamp, localtimestamp)
                        """);
                jdbc.update("""
                        insert into proposal (author_member_id, category, title, content, mood_options, created_at, updated_at)
                        select id, 'STUDY', '기존 제안', '보존할 본문', '', localtimestamp, localtimestamp from member
                        """);
                var history = jdbc.queryForList("select * from flyway_schema_history order by installed_rank");
                var proposals = jdbc.queryForList("select * from proposal");
                Flyway upgraded = Flyway.configure().dataSource(isolated).schemas(schema)
                        .locations("classpath:db/migration").load();
                assertThat(upgraded.getConfiguration().isOutOfOrder()).isFalse();

                // When
                int appliedMigrations = upgraded.migrate().migrationsExecuted;

                // Then
                assertThat(appliedMigrations).isEqualTo(migrationCountIncludingMemberAffiliation(5));
                assertThat(jdbc.queryForList("select * from flyway_schema_history where version not in ('11', '12', '13', '14', '15', '16') order by installed_rank"))
                        .isEqualTo(history);
                assertThat(jdbc.queryForList("select * from proposal")).isEqualTo(proposals);
                assertThat(jdbc.queryForList("select tablename from pg_tables where schemaname = current_schema()", String.class))
                        .contains("announcements", "proposal", "proposal_interest", "proposal_comment");
                assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '12'", String.class))
                        .isEqualTo("V12__push_subscription_client_version.sql");
                assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '13'", String.class))
                        .isEqualTo("V13__group_announcements.sql");
                upgraded.validate();
                assertThat(upgraded.migrate().migrationsExecuted).isZero();
            } finally {
                connection.setSchema(originalSchema);
            }
        } finally {
            administrative.execute("drop schema " + schema + " cascade");
        }
    }

    @Test
    @DisplayName("촬영용 DB의 공지 V9 이력을 정정해도 공지 데이터와 체크섬을 보존한다.")
    void reconcilePreviewAnnouncementV9WithoutLosingData(@TempDir Path previousMigrations) throws SQLException, IOException {
        // Given
        for (String file : new String[]{"V1__baseline.sql", "V2__activity_post_comment_reaction.sql",
                "V3__activity_post_reaction_heart_only.sql", "V4__image_lifecycle.sql",
                "V6__activity_post_interaction_notification.sql", "V7__worker_authority.sql",
                "V8__group_chat.sql", "V10__meeting_proposal.sql", "V13__group_announcements.sql"}) {
            try (var input = new ClassPathResource("db/migration/" + file).getInputStream()) {
                Files.copy(input, previousMigrations.resolve(file.replace("V13__", "V9__")));
            }
        }
        String schema = "announcement_reconcile_" + UUID.randomUUID().toString().replace("-", "");
        JdbcTemplate administrative = new JdbcTemplate(dataSource);
        administrative.execute("create schema " + schema);
        try (Connection connection = dataSource.getConnection()) {
            String originalSchema = connection.getSchema();
            try {
                connection.setSchema(schema);
                SingleConnectionDataSource isolated = new SingleConnectionDataSource(connection, true);
                Flyway.configure().dataSource(isolated).schemas(schema)
                        .locations("filesystem:" + previousMigrations).load().migrate();
                JdbcTemplate jdbc = new JdbcTemplate(isolated);
                jdbc.update("""
                        insert into member (crew_name, generation, github_id, member_type, course, created_at, updated_at)
                        values ('우주', 8, 'announcement-reconcile-member', 'CREW', 'BACKEND', localtimestamp, localtimestamp)
                        """);
                jdbc.update("""
                        insert into groups (name, introduction, type, status, meeting_type, created_at, updated_at)
                        values ('보존할 모임', '공지 이력 정정 검증', 'STUDY', 'ACTIVE', 'ONLINE', localtimestamp, localtimestamp)
                        """);
                jdbc.update("""
                        insert into announcements (group_id, author_member_id, title, content, scope, created_at, updated_at)
                        select g.id, m.id, '기존 공지', '보존할 본문', 'MEMBERS', localtimestamp, localtimestamp
                        from groups g cross join member m
                        """);
                // 촬영 DB의 V9 리소스를 유지하고 회원 소속 V11과 구독 지원 V12를 추가한다.
                ClassPathResource memberAffiliation = new ClassPathResource("db/migration/V11__member_affiliation.sql");
                if (memberAffiliation.exists()) {
                    try (var input = memberAffiliation.getInputStream()) {
                        Files.copy(input, previousMigrations.resolve("V11__member_affiliation.sql"));
                    }
                }
                try (var input = new ClassPathResource("db/migration/V12__push_subscription_client_version.sql").getInputStream()) {
                    Files.copy(input, previousMigrations.resolve("V12__push_subscription_client_version.sql"));
                }
                assertThat(Flyway.configure().dataSource(isolated).schemas(schema)
                        .locations("filesystem:" + previousMigrations).load().migrate().migrationsExecuted)
                        .isEqualTo(migrationCountIncludingMemberAffiliation(1));
                var announcements = jdbc.queryForList("select * from announcements");
                var history = jdbc.queryForList("select * from flyway_schema_history where version <> '9' order by installed_rank");

                // When
                int corrected = jdbc.update("""
                        update flyway_schema_history set version = '13', script = 'V13__group_announcements.sql'
                        where version = '9' and script = 'V9__group_announcements.sql'
                          and description = 'group announcements' and type = 'SQL'
                          and checksum = -1253084773 and success
                        """);
                Flyway normal = Flyway.configure().dataSource(isolated).schemas(schema)
                        .locations("classpath:db/migration").load();

                // Then
                assertThat(corrected).isEqualTo(1);
                assertThat(normal.getConfiguration().isOutOfOrder()).isFalse();
                assertThat(normal.migrate().migrationsExecuted).isEqualTo(3);
                normal.validate();
                assertThat(normal.migrate().migrationsExecuted).isZero();
                assertThat(jdbc.queryForList("select * from announcements")).isEqualTo(announcements);
                assertThat(jdbc.queryForList("select * from flyway_schema_history where version not in ('13', '14', '15', '16') order by installed_rank"))
                        .isEqualTo(history);
                assertThat(jdbc.queryForObject("select checksum from flyway_schema_history where version = '13'", Integer.class))
                        .isEqualTo(-1253084773);
            } finally {
                connection.setSchema(originalSchema);
            }
        } finally {
            administrative.execute("drop schema " + schema + " cascade");
        }
    }

    @Test
    @DisplayName("시험 DB에 잘못 사용한 worker V4 번호를 정정해도 테이블을 재생성하거나 데이터를 잃지 않는다.")
    void reconcileRehearsalWorkerVersionWithoutRecreatingTable(@TempDir Path legacy) throws SQLException, IOException {
        // Given
        for (String file : new String[]{"V1__baseline.sql", "V2__activity_post_comment_reaction.sql",
                "V3__activity_post_reaction_heart_only.sql", "V7__worker_authority.sql"}) {
            try (var input = new ClassPathResource("db/migration/" + file).getInputStream()) {
                Files.copy(input, legacy.resolve(file.replace("V7__", "V4__")));
            }
        }
        String schema = "worker_reconcile_" + UUID.randomUUID().toString().replace("-", "");
        JdbcTemplate administrative = new JdbcTemplate(dataSource);
        administrative.execute("create schema " + schema);
        try (Connection connection = dataSource.getConnection()) {
            String originalSchema = connection.getSchema();
            try {
                connection.setSchema(schema);
                SingleConnectionDataSource isolated = new SingleConnectionDataSource(connection, true);
                Flyway.configure().dataSource(isolated).schemas(schema)
                        .locations("filesystem:" + legacy).load().migrate();
                JdbcTemplate jdbc = new JdbcTemplate(isolated);
                jdbc.update("insert into worker_authority(environment) values ('migration-test')");
                var worker = jdbc.queryForList("select * from worker_authority");

                // When
                int corrected = jdbc.update("""
                        update flyway_schema_history set version = '7', script = 'V7__worker_authority.sql'
                        where version = '4' and script = 'V4__worker_authority.sql'
                          and description = 'worker authority' and type = 'SQL'
                          and checksum = 1532855250 and success
                        """);
                int appliedMigrations = Flyway.configure().dataSource(isolated).schemas(schema)
                        .locations("classpath:db/migration").outOfOrder(true).load().migrate().migrationsExecuted;

                // Then
                assertThat(corrected).isEqualTo(1);
                assertThat(appliedMigrations).isEqualTo(migrationCountIncludingMemberAffiliation(9));
                assertThat(jdbc.queryForList("select * from worker_authority")).isEqualTo(worker);
                assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '4'", String.class))
                        .isEqualTo("V4__image_lifecycle.sql");
                assertThat(jdbc.queryForObject("select checksum from flyway_schema_history where version = '7'", Integer.class))
                        .isEqualTo(1532855250);
                assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '8'", String.class))
                        .isEqualTo("V8__group_chat.sql");
                assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '12'", String.class))
                        .isEqualTo("V12__push_subscription_client_version.sql");
                assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '13'", String.class))
                        .isEqualTo("V13__group_announcements.sql");
                assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '10'", String.class))
                        .isEqualTo("V10__meeting_proposal.sql");
                Flyway normal = Flyway.configure().dataSource(isolated).schemas(schema)
                        .locations("classpath:db/migration").load();
                normal.validate();
                assertThat(normal.migrate().migrationsExecuted).isZero();
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
