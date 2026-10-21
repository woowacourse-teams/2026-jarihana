package com.project.jarihana.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ImageLifecycleMigrationTest {

    @DisplayName("PostgreSQL 이미지 수명주기 SQL은 종료 그룹을 보존하고 숨김 활동기록을 제외해 재실행할 수 있다.")
    @Test
    void migratesAndBackfillsLegacyImagesIdempotently() throws Exception {
        String url = "jdbc:tc:postgresql:17:///image_lifecycle_migration_test";
        try (var connection = DriverManager.getConnection(url); var statement = connection.createStatement()) {
            createLegacySchema(statement);
            insertLegacyRows(statement);
            String migration = Files.readString(Path.of("src/main/resources/db/migration/V4__image_lifecycle.sql"));

            connection.setAutoCommit(false);
            executePostgresMigration(connection, statement, migration);
            executePostgresMigration(connection, statement, migration);

            assertThat(count(statement.executeQuery("SELECT COUNT(*) FROM image_reference"))).isEqualTo(7);
            assertThat(count(statement.executeQuery("""
                    SELECT COUNT(*)
                    FROM image_reference
                    WHERE group_id = 2
                    """))).isEqualTo(4);
            assertThat(count(statement.executeQuery("""
                    SELECT COUNT(*)
                    FROM image_reference
                    WHERE reference_type = 'ACTIVITY_POST' AND owner_id = 101
                    """))).isEqualTo(1);
            assertThat(count(statement.executeQuery("""
                    SELECT COUNT(*)
                    FROM image_reference
                    WHERE reference_type = 'ACTIVITY_POST' AND owner_id = 102
                    """))).isZero();
            assertThat(value(statement, "groups/tmp/hidden.webp", "status")).isEqualTo("TEMPORARY");
            assertThat(value(statement, "groups/tmp/shared.webp", "status")).isEqualTo("ATTACHED");
            assertThat(value(statement, "groups/tmp/shared.webp", "attached_group_id")).isNull();
            assertThat(value(statement, "groups/tmp/ended-representative.webp", "attached_group_id"))
                    .isEqualTo("2");
        }
    }

    private void createLegacySchema(Statement statement) throws SQLException {
        statement.execute("CREATE TABLE member (id BIGINT PRIMARY KEY)");
        statement.execute("""
                CREATE TABLE groups (
                    id BIGINT PRIMARY KEY,
                    status VARCHAR(20) NOT NULL,
                    description VARCHAR(10000),
                    representative_image_key VARCHAR(255)
                )
                """);
        statement.execute("""
                CREATE TABLE image_upload (
                    id UUID PRIMARY KEY,
                    file_name VARCHAR(255) NOT NULL,
                    content_type VARCHAR(100) NOT NULL,
                    file_size BIGINT NOT NULL,
                    image_key VARCHAR(255) NOT NULL UNIQUE,
                    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
                    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL
                )
                """);
        statement.execute("""
                CREATE TABLE activity_post (
                    id BIGINT PRIMARY KEY,
                    group_id BIGINT,
                    deleted_at TIMESTAMP WITHOUT TIME ZONE
                )
                """);
        statement.execute("""
                CREATE TABLE activity_post_photo (
                    id BIGINT PRIMARY KEY,
                    activity_post_id BIGINT NOT NULL,
                    image_key VARCHAR(255) NOT NULL
                )
                """);
    }

    private void insertLegacyRows(Statement statement) throws SQLException {
        statement.execute("INSERT INTO member VALUES (1)");
        statement.execute("""
                INSERT INTO groups VALUES
                    (1, 'ACTIVE',
                     '![소개](https://old.example/images/groups/tmp/active-description.webp) ![공유](/images/groups/tmp/shared.webp)',
                     'groups/tmp/active-representative.webp'),
                    (2, 'ENDED',
                     '![소개](groups/tmp/ended-description.webp) ![공유](groups/tmp/shared.webp)',
                     'groups/tmp/ended-representative.webp'),
                    (3, 'ACTIVE', NULL, 'images/default-group.png')
                """);
        insertUpload(statement, "00000000-0000-0000-0000-000000000001", "groups/tmp/active-representative.webp");
        insertUpload(statement, "00000000-0000-0000-0000-000000000002", "groups/tmp/active-description.webp");
        insertUpload(statement, "00000000-0000-0000-0000-000000000003", "groups/tmp/ended-representative.webp");
        insertUpload(statement, "00000000-0000-0000-0000-000000000004", "groups/tmp/ended-description.webp");
        insertUpload(statement, "00000000-0000-0000-0000-000000000005", "groups/tmp/shared.webp");
        insertUpload(statement, "00000000-0000-0000-0000-000000000006", "groups/tmp/activity.webp");
        insertUpload(statement, "00000000-0000-0000-0000-000000000007", "groups/tmp/hidden.webp");
        statement.execute("""
                INSERT INTO activity_post VALUES
                    (101, 2, NULL),
                    (102, NULL, '2026-10-01 10:00:00')
                """);
        statement.execute("""
                INSERT INTO activity_post_photo VALUES
                    (1, 101, 'groups/tmp/activity.webp'),
                    (2, 102, 'groups/tmp/hidden.webp')
                """);
    }

    private void insertUpload(Statement statement, String id, String imageKey) throws SQLException {
        statement.execute("""
                INSERT INTO image_upload (
                    id, file_name, content_type, file_size, image_key, expires_at, created_at, updated_at
                ) VALUES (
                    '%s', 'legacy.webp', 'image/webp', 1024, '%s',
                    '2026-09-01 00:00:00', '2026-08-01 00:00:00', '2026-08-01 00:00:00'
                )
                """.formatted(id, imageKey));
    }

    private String value(Statement statement, String imageKey, String column) throws SQLException {
        try (ResultSet rows = statement.executeQuery(
                "SELECT " + column + "::text FROM image_upload WHERE image_key = '" + imageKey + "'")) {
            assertThat(rows.next()).isTrue();
            return rows.getString(1);
        }
    }

    private long count(ResultSet rows) throws SQLException {
        try (rows) {
            assertThat(rows.next()).isTrue();
            return rows.getLong(1);
        }
    }

    private void executePostgresScript(Statement statement, String sql) throws SQLException {
        int start = 0;
        boolean inDollarQuotedBlock = false;
        for (int index = 0; index < sql.length(); index++) {
            if (sql.startsWith("$$", index)) {
                inDollarQuotedBlock = !inDollarQuotedBlock;
                index++;
            } else if (sql.charAt(index) == ';' && !inDollarQuotedBlock) {
                executeMigrationStatement(statement, sql.substring(start, index + 1).trim());
                start = index + 1;
            }
        }
        executeMigrationStatement(statement, sql.substring(start).trim());
    }

    private void executePostgresMigration(Connection connection, Statement statement, String migration)
            throws SQLException {
        try {
            executePostgresScript(statement, migration);
            connection.commit();
        } catch (SQLException exception) {
            connection.rollback();
            throw exception;
        }
    }

    private void executeMigrationStatement(Statement statement, String command) throws SQLException {
        if (command.isEmpty()) {
            return;
        }
        try {
            statement.execute(command);
        } catch (SQLException exception) {
            throw new SQLException("Failed migration statement: " + command, exception);
        }
    }
}
