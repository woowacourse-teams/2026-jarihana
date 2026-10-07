package com.project.jarihana.notification.repository;

import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.hibernate.cfg.AvailableSettings;
import org.hibernate.tool.schema.spi.SchemaManagementException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import com.project.jarihana.support.IntegrationTestSupport;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NotificationSchemaMigrationTest extends IntegrationTestSupport {

    @Autowired
    private DataSource dataSource;
    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Test
    @DisplayName("별도 스키마에서 수동 SQL을 적용한 뒤 Hibernate validate와 실제 DB 제약 및 인덱스를 검증한다.")
    void applyManualSqlAndValidateSchemaConstraintsAndIndexes() throws SQLException {
        // Given
        String schema = "notification_migration_" + UUID.randomUUID().toString().replace("-", "");
        try (Connection connection = dataSource.getConnection()) {
            String originalSchema = connection.getSchema();
            JdbcTemplate administrative = new JdbcTemplate(dataSource);
            administrative.execute("create schema " + schema);
            try {
                connection.setSchema(schema);
                SingleConnectionDataSource isolated = new SingleConnectionDataSource(connection, true);
                JdbcTemplate jdbc = new JdbcTemplate(isolated);
                buildSchema(isolated, schema, "create");
                jdbc.execute("drop table notification_deliveries, push_subscriptions, notifications");
                assertThatThrownBy(() -> buildSchema(isolated, schema, "validate"))
                        .isInstanceOf(SchemaManagementException.class);

                // When
                ResourceDatabasePopulator migration = new ResourceDatabasePopulator(
                        new FileSystemResource("db/migrations/2026-10-03-notification.sql"));
                migration.execute(isolated);
                buildSchema(isolated, schema, "validate");

                // Then
                assertColumnTypes(jdbc, schema);
                assertIndexes(jdbc, schema);
                assertConstraints(jdbc);
                assertSubscriptionAccessPaths(jdbc);
                migration.execute(isolated);
                assertThat(jdbc.queryForObject("select count(*) from notifications", Long.class)).isEqualTo(1);
            } finally {
                connection.setSchema(originalSchema);
                administrative.execute("drop schema " + schema + " cascade");
            }
        }
    }

    private void buildSchema(DataSource isolated, String schema, String action) {
        var registry = new StandardServiceRegistryBuilder()
                .applySettings(entityManagerFactory.getProperties())
                .applySetting(AvailableSettings.JAKARTA_NON_JTA_DATASOURCE, isolated)
                .applySetting(AvailableSettings.DEFAULT_SCHEMA, schema)
                .applySetting(AvailableSettings.HBM2DDL_AUTO, action)
                .build();
        try {
            MetadataSources sources = new MetadataSources(registry);
            entityManagerFactory.getMetamodel().getEntities().forEach(entity -> sources.addAnnotatedClass(entity.getJavaType()));
            try (SessionFactory sessionFactory = sources.buildMetadata().buildSessionFactory()) {
                assertThat(sessionFactory.isOpen()).isTrue();
            }
        } finally {
            StandardServiceRegistryBuilder.destroy(registry);
        }
    }

    private void assertColumnTypes(JdbcTemplate jdbc, String schema) {
        assertThat(jdbc.queryForObject("""
                select data_type from information_schema.columns
                where table_schema = ? and table_name = 'notifications' and column_name = 'payload'
                """, String.class, schema)).isEqualTo("jsonb");
        assertThat(jdbc.queryForObject("""
                select data_type from information_schema.columns
                where table_schema = ? and table_name = 'notifications' and column_name = 'payload_version'
                """, String.class, schema)).isEqualTo("smallint");
        assertThat(jdbc.queryForList("""
                select distinct data_type from information_schema.columns
                where table_schema = ? and table_name in ('notifications', 'push_subscriptions', 'notification_deliveries')
                  and column_name in ('created_at', 'updated_at', 'read_at', 'deleted_at', 'last_seen_at',
                      'disabled_at', 'next_attempt_at', 'expires_at', 'locked_until', 'accepted_at')
                """, String.class, schema)).containsExactly("timestamp without time zone");
    }

    private void assertIndexes(JdbcTemplate jdbc, String schema) {
        List<String> indexes = jdbc.queryForList("select indexname from pg_indexes where schemaname = ?", String.class, schema);
        assertThat(indexes).contains("idx_notifications_inbox", "idx_notifications_unread",
                "idx_push_subscriptions_active", "idx_notification_deliveries_due", "idx_notification_deliveries_expired_lease",
                "idx_push_subscriptions_inbox", "idx_notification_deliveries_subscription_unfinished");
        assertThat(jdbc.queryForObject("select indexdef from pg_indexes where schemaname = ? and indexname = 'idx_notifications_inbox'",
                String.class, schema)).contains("member_id, created_at DESC, id DESC").contains("deleted_at IS NULL");
        assertThat(jdbc.queryForObject("select indexdef from pg_indexes where schemaname = ? and indexname = 'idx_notifications_unread'",
                String.class, schema)).contains("deleted_at IS NULL").contains("read_at IS NULL");
        assertThat(jdbc.queryForObject("select indexdef from pg_indexes where schemaname = ? and indexname = 'idx_push_subscriptions_active'",
                String.class, schema)).contains("enabled = true");
        assertThat(jdbc.queryForObject("select indexdef from pg_indexes where schemaname = ? and indexname = 'idx_notification_deliveries_due'",
                String.class, schema)).contains("next_attempt_at, id").contains("PENDING").contains("RETRY");
        assertThat(jdbc.queryForObject("select indexdef from pg_indexes where schemaname = ? and indexname = 'idx_notification_deliveries_expired_lease'",
                String.class, schema)).contains("locked_until, id").contains("IN_FLIGHT");
        assertThat(jdbc.queryForObject("select indexdef from pg_indexes where schemaname = ? and indexname = 'idx_push_subscriptions_inbox'",
                String.class, schema)).contains("member_id, created_at DESC, id DESC");
        assertThat(jdbc.queryForObject("select indexdef from pg_indexes where schemaname = ? and indexname = 'idx_notification_deliveries_subscription_unfinished'",
                String.class, schema)).contains("push_subscription_id, subscription_generation").contains("PENDING").contains("RETRY").contains("IN_FLIGHT");
    }

    private void assertSubscriptionAccessPaths(JdbcTemplate jdbc) {
        jdbc.update("""
                insert into push_subscriptions (id, member_id, endpoint, p256dh, auth, enabled, generation,
                    last_seen_at, disabled_at, created_at, updated_at)
                select 1000 + value, 1, 'https://fcm.googleapis.com/index/' || value, 'public-key', 'auth-value',
                    value % 2 = 0, 1, localtimestamp, case when value % 2 = 0 then null else localtimestamp end,
                    localtimestamp, localtimestamp from generate_series(1, 10000) value
                """);
        jdbc.update("""
                insert into notification_deliveries (notification_id, push_subscription_id, subscription_generation,
                    status, attempt_count, next_attempt_at, expires_at, created_at, updated_at)
                select 1, 1000 + value, 1, 'PENDING', 0, localtimestamp, localtimestamp + interval '24 hours',
                    localtimestamp, localtimestamp from generate_series(1, 10000) value
                """);
        jdbc.execute("analyze push_subscriptions");
        jdbc.execute("analyze notification_deliveries");
        String listing = String.join("\n", jdbc.queryForList("""
                explain select id, generation, enabled, last_seen_at from push_subscriptions
                where member_id = 1 order by created_at desc, id desc limit 20
                """, String.class));
        String cancellation = String.join("\n", jdbc.queryForList("""
                explain update notification_deliveries set status = 'CANCELLED'
                where push_subscription_id = 1001 and subscription_generation < 2
                    and status in ('PENDING', 'RETRY', 'IN_FLIGHT')
                """, String.class));
        assertThat(listing).contains("idx_push_subscriptions_inbox");
        assertThat(cancellation).contains("idx_notification_deliveries_subscription_unfinished");
    }

    private void assertConstraints(JdbcTemplate jdbc) {
        jdbc.update("""
                insert into member (id, crew_name, generation, github_id, member_type, course, created_at, updated_at)
                values (1, '우주', 8, '123', 'CREW', 'BACKEND', localtimestamp, localtimestamp)
                """);
        jdbc.update("""
                insert into notifications (member_id, event_key, event_type, payload_version, payload, created_at, updated_at)
                values (1, 'registration:3:approved', 'REGISTRATION_APPROVED', 1,
                    '{"groupId":1,"recruitmentId":2,"registrationId":3}', localtimestamp, localtimestamp)
                """);
        jdbc.update("""
                insert into push_subscriptions (member_id, endpoint, p256dh, auth, enabled, generation,
                    last_seen_at, created_at, updated_at)
                values (1, 'https://fcm.googleapis.com/x', 'public-key', 'auth-value', true, 1,
                    localtimestamp, localtimestamp, localtimestamp)
                """);
        jdbc.update("""
                insert into notification_deliveries (notification_id, push_subscription_id,
                    subscription_generation, status, attempt_count, next_attempt_at, expires_at, created_at, updated_at)
                values (1, 1, 1, 'PENDING', 0, localtimestamp, localtimestamp + interval '24 hours', localtimestamp, localtimestamp)
                """);

        for (String update : List.of(
                "update notifications set member_id = 999 where id = 1",
                "update notifications set payload_version = 0 where id = 1",
                "update notifications set event_type = 'UNKNOWN' where id = 1",
                "update notifications set event_key = ' ' where id = 1",
                "update notifications set payload = '[]' where id = 1",
                "update push_subscriptions set member_id = 999 where id = 1",
                "update push_subscriptions set generation = 0 where id = 1",
                "update push_subscriptions set enabled = false where id = 1",
                "update push_subscriptions set endpoint = 'https://fcm.googleapis.com/' || repeat('가', 700) where id = 1",
                "update notification_deliveries set subscription_generation = 0 where id = 1",
                "update notification_deliveries set notification_id = 999 where id = 1",
                "update notification_deliveries set push_subscription_id = 999 where id = 1",
                "update notification_deliveries set status = 'UNKNOWN' where id = 1",
                "update notification_deliveries set attempt_count = -1 where id = 1",
                "update notification_deliveries set attempt_count = 1 where id = 1",
                "update notification_deliveries set attempt_count = 6 where id = 1",
                "update notification_deliveries set status = 'RETRY' where id = 1",
                "update notification_deliveries set status = 'IN_FLIGHT', attempt_count = 1 where id = 1",
                "update notification_deliveries set status = 'IN_FLIGHT', attempt_count = 0,"
                        + " lease_token = '00000000-0000-0000-0000-000000000001', locked_until = localtimestamp where id = 1",
                "update notification_deliveries set lease_token = '00000000-0000-0000-0000-000000000001' where id = 1",
                "update notification_deliveries set locked_until = localtimestamp where id = 1",
                "update notification_deliveries set status = 'ACCEPTED', attempt_count = 1 where id = 1",
                "update notification_deliveries set status = 'ACCEPTED', attempt_count = 0, accepted_at = localtimestamp where id = 1",
                "update notification_deliveries set accepted_at = localtimestamp where id = 1",
                "update notification_deliveries set expires_at = created_at where id = 1",
                "delete from member where id = 1",
                "delete from notifications where id = 1"
        )) {
            assertThatThrownBy(() -> jdbc.update(update)).as(update).isInstanceOf(DataIntegrityViolationException.class);
        }
        assertThatThrownBy(() -> jdbc.update("""
                insert into notifications (member_id, event_key, event_type, payload_version, payload, created_at, updated_at)
                select member_id, event_key, event_type, payload_version, payload, created_at, updated_at from notifications
                """)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("""
                insert into push_subscriptions (member_id, endpoint, p256dh, auth, enabled, generation, last_seen_at, created_at, updated_at)
                select member_id, endpoint, p256dh, auth, enabled, generation, last_seen_at, created_at, updated_at from push_subscriptions
                """)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("""
                insert into notification_deliveries (notification_id, push_subscription_id, subscription_generation, status,
                    attempt_count, next_attempt_at, expires_at, created_at, updated_at)
                select notification_id, push_subscription_id, subscription_generation, status, attempt_count,
                    next_attempt_at, expires_at, created_at, updated_at from notification_deliveries
                """)).isInstanceOf(DataIntegrityViolationException.class);

        for (int attemptCount : List.of(0, 1, 4, 5)) {
            jdbc.update("update notification_deliveries set status = 'FAILED', attempt_count = ? where id = 1", attemptCount);
            assertThat(jdbc.queryForObject("select attempt_count from notification_deliveries where id = 1", Integer.class))
                    .isEqualTo(attemptCount);
        }
        assertThatThrownBy(() -> jdbc.update("update notification_deliveries set attempt_count = -1 where id = 1"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("update notification_deliveries set attempt_count = 6 where id = 1"))
                .isInstanceOf(DataIntegrityViolationException.class);
        jdbc.update("update notification_deliveries set status = 'PENDING', attempt_count = 0 where id = 1");

        jdbc.update("""
                update notification_deliveries
                set status = 'IN_FLIGHT', attempt_count = 1, lease_token = '00000000-0000-0000-0000-000000000001',
                    locked_until = localtimestamp + interval '30 seconds' where id = 1
                """);
        jdbc.update("""
                update notification_deliveries
                set status = 'RETRY', lease_token = null, locked_until = null, next_attempt_at = localtimestamp + interval '5 seconds'
                where id = 1
                """);
        assertThatThrownBy(() -> jdbc.update("update notification_deliveries set attempt_count = 5 where id = 1"))
                .isInstanceOf(DataIntegrityViolationException.class);
        jdbc.update("""
                update notification_deliveries
                set status = 'ACCEPTED', accepted_at = localtimestamp, updated_at = localtimestamp where id = 1
                """);
        assertThat(jdbc.queryForObject("select status from notification_deliveries where id = 1", String.class)).isEqualTo("ACCEPTED");
    }
}
