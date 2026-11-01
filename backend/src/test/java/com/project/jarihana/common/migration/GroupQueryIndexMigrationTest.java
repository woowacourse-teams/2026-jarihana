package com.project.jarihana.common.migration;

import com.project.jarihana.support.IntegrationTestSupport;
import jakarta.persistence.EntityManagerFactory;
import org.flywaydb.core.Flyway;
import org.hibernate.SessionFactory;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.hibernate.cfg.AvailableSettings;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class GroupQueryIndexMigrationTest extends IntegrationTestSupport {

    @Autowired
    private DataSource dataSource;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Test
    @DisplayName("JPA와 Flyway는 그룹 조회 인덱스의 이름, 컬럼 순서와 내림차순을 동일하게 생성한다.")
    void jpaAndFlywayCreateMatchingGroupQueryIndexes() throws SQLException {
        // Given
        String suffix = UUID.randomUUID().toString().replace("-", "");
        String jpaSchema = "group_index_jpa_" + suffix;
        String flywaySchema = "group_index_flyway_" + suffix;
        JdbcTemplate administrative = new JdbcTemplate(dataSource);
        administrative.execute("create schema " + jpaSchema);
        administrative.execute("create schema " + flywaySchema);
        try (Connection connection = dataSource.getConnection()) {
            String originalSchema = connection.getSchema();
            try {
                SingleConnectionDataSource isolated = new SingleConnectionDataSource(connection, true);
                JdbcTemplate jdbc = new JdbcTemplate(isolated);

                // When
                connection.setSchema(jpaSchema);
                buildSchema(isolated, jpaSchema);
                connection.setSchema(flywaySchema);
                Flyway.configure().dataSource(isolated).schemas(flywaySchema)
                        .locations("classpath:db/migration").target("17").load().migrate();

                // Then
                assertGroupQueryIndexes(jdbc, jpaSchema);
                assertGroupQueryIndexes(jdbc, flywaySchema);
                assertThat(groupQueryIndexes(jdbc, jpaSchema))
                        .isEqualTo(groupQueryIndexes(jdbc, flywaySchema));
            } finally {
                connection.setSchema(originalSchema);
            }
        } finally {
            administrative.execute("drop schema " + jpaSchema + " cascade");
            administrative.execute("drop schema " + flywaySchema + " cascade");
        }
    }

    @Test
    @DisplayName("V17은 V16의 데이터, 인덱스, 제약과 이력을 보존하고 구버전 INSERT와 재실행을 허용한다.")
    void upgradeAfterV16PreservesExistingSchemaAndOldInserts() throws SQLException {
        // Given
        String schema = "group_index_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        JdbcTemplate administrative = new JdbcTemplate(dataSource);
        administrative.execute("create schema " + schema);
        try (Connection connection = dataSource.getConnection()) {
            String originalSchema = connection.getSchema();
            try {
                connection.setSchema(schema);
                SingleConnectionDataSource isolated = new SingleConnectionDataSource(connection, true);
                Flyway.configure().dataSource(isolated).schemas(schema)
                        .locations("classpath:db/migration").target("16").load().migrate();
                JdbcTemplate jdbc = new JdbcTemplate(isolated);
                insertOldRows(jdbc, 1);
                Map<String, List<Map<String, Object>>> oldRows = new LinkedHashMap<>();
                for (String table : List.of("member", "groups", "group_recruitment", "registration")) {
                    oldRows.put(table, jdbc.queryForList("select * from " + table + " order by id"));
                }
                var oldIndexes = jdbc.queryForList("""
                        select tablename, indexname, indexdef from pg_indexes
                        where schemaname = ? order by tablename, indexname
                        """, schema);
                var oldConstraints = constraints(jdbc, schema);
                var history = jdbc.queryForList("select * from flyway_schema_history order by installed_rank");
                Flyway upgraded = Flyway.configure().dataSource(isolated).schemas(schema)
                        .locations("classpath:db/migration").target("17").load();

                // When
                int applied = upgraded.migrate().migrationsExecuted;

                // Then
                assertThat(applied).isEqualTo(1);
                assertGroupQueryIndexes(jdbc, schema);
                for (var entry : oldRows.entrySet()) {
                    assertThat(jdbc.queryForList("select * from " + entry.getKey() + " order by id"))
                            .as(entry.getKey()).isEqualTo(entry.getValue());
                }
                assertThat(jdbc.queryForList("""
                        select tablename, indexname, indexdef from pg_indexes
                        where schemaname = ? order by tablename, indexname
                        """, schema)).hasSize(oldIndexes.size() + 3).containsAll(oldIndexes);
                assertThat(constraints(jdbc, schema)).isEqualTo(oldConstraints);
                assertThat(jdbc.queryForList("""
                        select * from flyway_schema_history where version <> '17' order by installed_rank
                        """)).isEqualTo(history);
                assertThat(jdbc.queryForObject("""
                        select count(*) from flyway_schema_history where version = '17' and success
                        """, Integer.class)).isEqualTo(1);

                insertOldRows(jdbc, 2);
                for (String table : oldRows.keySet()) {
                    assertThat(jdbc.queryForObject("select count(*) from " + table, Integer.class))
                            .as(table).isEqualTo(2);
                }
                upgraded.validate();
                assertThat(upgraded.migrate().migrationsExecuted).isZero();
            } finally {
                connection.setSchema(originalSchema);
            }
        } finally {
            administrative.execute("drop schema " + schema + " cascade");
        }
    }

    private void insertOldRows(JdbcTemplate jdbc, long id) {
        jdbc.update("""
                insert into member (id, crew_name, generation, github_id, member_type, course, created_at, updated_at)
                values (?, ?, 8, ?, 'CREW', 'BACKEND', localtimestamp, localtimestamp)
                """, id, "회원" + id, "group-index-" + id);
        jdbc.update("""
                insert into groups (id, name, introduction, status, type, meeting_type, created_at, updated_at)
                values (?, ?, '기존 소개', 'ACTIVE', 'STUDY', 'ONLINE', localtimestamp, localtimestamp)
                """, id, "기존 모임 " + id);
        jdbc.update("""
                insert into group_recruitment (id, group_id, join_method, capacity, starts_at, ends_at, created_at, updated_at)
                values (?, ?, 'APPROVAL', 5, localtimestamp, null, localtimestamp, localtimestamp)
                """, id, id);
        jdbc.update("""
                insert into registration (id, recruitment_id, member_id, message, status, registered_at, created_at, updated_at)
                values (?, ?, ?, '기존 신청', 'PENDING', localtimestamp, localtimestamp, localtimestamp)
                """, id, id, id);
    }

    private List<Map<String, Object>> constraints(JdbcTemplate jdbc, String schema) {
        return jdbc.queryForList("""
                select relation.relname, constraint_definition.conname, constraint_definition.contype,
                       pg_get_constraintdef(constraint_definition.oid) as definition
                from pg_constraint constraint_definition
                join pg_class relation on relation.oid = constraint_definition.conrelid
                join pg_namespace namespace on namespace.oid = relation.relnamespace
                where namespace.nspname = ?
                order by relation.relname, constraint_definition.conname
                """, schema);
    }

    private List<String> groupQueryIndexes(JdbcTemplate jdbc, String schema) {
        return jdbc.queryForList("""
                select replace(indexdef, ? || '.', '') from pg_indexes
                where schemaname = ? and indexname in (
                    'idx_groups_status_created_id', 'idx_group_recruitment_group_id',
                    'idx_registration_recruitment_id')
                order by indexname
                """, String.class, schema, schema);
    }

    private void assertGroupQueryIndexes(JdbcTemplate jdbc, String schema) {
        assertThat(groupQueryIndexes(jdbc, schema)).containsExactly(
                "CREATE INDEX idx_group_recruitment_group_id ON group_recruitment USING btree (group_id)",
                "CREATE INDEX idx_groups_status_created_id ON groups USING btree (status, created_at DESC, id DESC)",
                "CREATE INDEX idx_registration_recruitment_id ON registration USING btree (recruitment_id)");
    }

    private void buildSchema(DataSource isolated, String schema) {
        var registry = new StandardServiceRegistryBuilder().applySettings(entityManagerFactory.getProperties())
                .applySetting(AvailableSettings.JAKARTA_NON_JTA_DATASOURCE, isolated)
                .applySetting(AvailableSettings.DEFAULT_SCHEMA, schema)
                .applySetting(AvailableSettings.HBM2DDL_AUTO, "create").build();
        try {
            MetadataSources sources = new MetadataSources(registry);
            entityManagerFactory.getMetamodel().getEntities()
                    .forEach(entity -> sources.addAnnotatedClass(entity.getJavaType()));
            try (SessionFactory factory = sources.buildMetadata().buildSessionFactory()) {
                assertThat(factory.isOpen()).isTrue();
            }
        } finally {
            StandardServiceRegistryBuilder.destroy(registry);
        }
    }
}
