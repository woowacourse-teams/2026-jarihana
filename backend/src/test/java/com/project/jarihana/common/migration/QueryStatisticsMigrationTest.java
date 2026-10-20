package com.project.jarihana.common.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class QueryStatisticsMigrationTest {

    @Test
    @DisplayName("확장 설치 권한이 없는 앱 계정도 모든 마이그레이션을 적용하고 재실행할 수 있다.")
    void migratesWithoutExtensionInstallationPrivilege() throws Exception {
        // Given
        try (Connection connection = newDatabase()) {
            JdbcTemplate jdbc = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
            jdbc.execute("create role migration_app nosuperuser nocreatedb nocreaterole");
            jdbc.execute("grant usage, create on schema public to migration_app");
            jdbc.execute("set role migration_app");
            assertThat(jdbc.queryForObject(
                    "select rolsuper from pg_roles where rolname = current_user", Boolean.class)).isFalse();
            Flyway flyway = migrations(connection);

            // When
            int applied = flyway.migrate().migrationsExecuted;

            // Then
            assertThat(applied).isEqualTo(5);
            assertThat(jdbc.queryForObject(
                    "select count(*) from pg_extension where extname = 'pg_stat_statements'", Integer.class)).isZero();
            assertThat(jdbc.queryForObject(
                    "select success from flyway_schema_history where version = '5'", Boolean.class)).isTrue();
            assertThat(jdbc.queryForObject(
                    "select to_regclass('image_reference') is not null", Boolean.class)).isTrue();
            assertThat(flyway.migrate().migrationsExecuted).isZero();
        }
    }

    @Test
    @DisplayName("관리자가 미리 설치한 쿼리 통계 확장을 앱 계정의 마이그레이션이 유지한다.")
    void preservesExtensionInstalledByAdministrator() throws Exception {
        // Given
        try (Connection connection = newDatabase()) {
            JdbcTemplate jdbc = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
            jdbc.execute("create extension pg_stat_statements with schema public");
            jdbc.execute("create role migration_app nosuperuser nocreatedb nocreaterole");
            jdbc.execute("grant usage, create on schema public to migration_app");
            jdbc.execute("set role migration_app");
            Flyway flyway = migrations(connection);

            // When
            int applied = flyway.migrate().migrationsExecuted;

            // Then
            assertThat(applied).isEqualTo(5);
            assertThat(jdbc.queryForObject("""
                    select count(*) from pg_extension
                    where extname = 'pg_stat_statements' and extnamespace = 'public'::regnamespace
                    """, Integer.class)).isEqualTo(1);
            assertThat(flyway.migrate().migrationsExecuted).isZero();
        }
    }

    private Connection newDatabase() throws Exception {
        return DriverManager.getConnection(
                "jdbc:tc:postgresql:17:///query_statistics_" + UUID.randomUUID().toString().replace("-", ""));
    }

    private Flyway migrations(Connection connection) {
        return Flyway.configure()
                .dataSource(new SingleConnectionDataSource(connection, true))
                .locations("classpath:db/migration")
                .load();
    }
}
