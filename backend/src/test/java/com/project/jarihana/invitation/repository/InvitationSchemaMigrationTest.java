package com.project.jarihana.invitation.repository;

import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.command.repository.GroupRecruitmentCommandRepository;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.registration.command.repository.RegistrationCommandRepository;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class InvitationSchemaMigrationTest extends IntegrationTestSupport {
    @Autowired private DataSource dataSource;
    @Autowired private EntityManagerFactory entityManagerFactory;
    @Autowired private GroupCommandRepository groups;
    @Autowired private MemberRepository members;
    @Autowired private GroupRecruitmentCommandRepository recruitments;
    @Autowired private RegistrationCommandRepository registrations;
    @Autowired private PlatformTransactionManager transactionManager;

    @Test
    @DisplayName("기존 신청이 있는 PostgreSQL에 DDL을 적용·재적용해 이력 보정·제약·Hibernate validate를 검증한다.")
    void migrateExistingHistoryAndValidateActualSchema() throws SQLException {
        // Given
        seedExistingHistory();
        String schema = "invitation_migration_" + UUID.randomUUID().toString().replace("-", "");
        JdbcTemplate administrative = new JdbcTemplate(dataSource);
        administrative.execute("create schema " + schema);
        try (Connection connection = dataSource.getConnection()) {
            String originalSchema = connection.getSchema();
            try {
                connection.setSchema(schema);
                SingleConnectionDataSource isolated = new SingleConnectionDataSource(connection, true);
                JdbcTemplate jdbc = new JdbcTemplate(isolated);
                buildSchema(isolated, schema, "create");
                jdbc.execute("drop table invitation_acceptance, invitation");
                jdbc.execute("alter table registration drop column approval_origin");
                jdbc.execute("alter table registration drop column version");
                for (String table : List.of("member", "groups", "group_recruitment")) {
                    jdbc.execute("insert into " + table + " select * from public." + table);
                }
                jdbc.execute("""
                        insert into registration (id, recruitment_id, member_id, message, status, reject_reason,
                            registered_at, decided_at, decided_by_type, decided_by_member_id, leader_viewed_at, created_at, updated_at)
                        select id, recruitment_id, member_id, message, status, reject_reason,
                            registered_at, decided_at, decided_by_type, decided_by_member_id, leader_viewed_at, created_at, updated_at
                        from public.registration
                        """);
                jdbc.execute("alter table groups drop column version");
                assertThat(jdbc.queryForObject("select count(*) from registration where status = 'APPROVED'", Long.class)).isEqualTo(1);
                assertThatThrownBy(() -> buildSchema(isolated, schema, "validate")).isInstanceOf(SchemaManagementException.class);

                // When
                ResourceDatabasePopulator migration = new ResourceDatabasePopulator(
                        new FileSystemResource("db/migrations/2026-10-11-invitation.sql"));
                migration.execute(isolated);
                ResourceDatabasePopulator versioning = new ResourceDatabasePopulator(
                        new FileSystemResource("db/migrations/2026-10-11-invitation-optimistic-locking.sql"));
                versioning.execute(isolated);
                versioning.execute(isolated);
                ResourceDatabasePopulator declining = new ResourceDatabasePopulator(
                        new FileSystemResource("db/migrations/2026-10-12-invitation-status.sql"));
                declining.execute(isolated);
                declining.execute(isolated);
                buildSchema(isolated, schema, "validate");

                // Then
                assertThat(jdbc.queryForObject("select count(*) from registration", Long.class)).isEqualTo(3);
                assertThat(jdbc.queryForObject("select count(*) from registration where approval_origin = 'RECRUITMENT'", Long.class)).isEqualTo(3);
                assertThat(jdbc.queryForObject("select count(*) from registration where version = 0", Long.class)).isEqualTo(3);
                assertThat(jdbc.queryForObject("select count(*) from groups where version = 0", Long.class)).isEqualTo(1);
                assertThat(jdbc.queryForObject("select count(*) from registration where status = 'APPROVED' and approval_origin = 'RECRUITMENT'", Long.class)).isEqualTo(1);
                assertThat(jdbc.queryForList("select distinct data_type from information_schema.columns where table_schema = '" + schema
                        + "' and table_name in ('invitation', 'invitation_acceptance') and column_name in ('created_at','updated_at','expires_at','revoked_at','accepted_at')", String.class))
                        .containsExactly("timestamp without time zone");
                assertThat(jdbc.queryForList("select indexname from pg_indexes where schemaname = ?", String.class, schema))
                        .contains("idx_invitation_group_created", "idx_invitation_target_created", "idx_invitation_acceptance_member");
                assertConstraintsAndDefault(jdbc);
                assertThatThrownBy(() -> jdbc.update("update invitation set status = 'REJECTED' where id = 1"))
                        .isInstanceOf(DataIntegrityViolationException.class);
                jdbc.update("update invitation set message = '기존 개인 메시지' where id = 1");
                ResourceDatabasePopulator messageRemoval = new ResourceDatabasePopulator(
                        new FileSystemResource("db/migrations/2026-10-11-invitation-message-removal.sql"));
                messageRemoval.execute(isolated);
                messageRemoval.execute(isolated);
                jdbc.update("update invitation set version = 7 where id = 1");
                versioning.execute(isolated);
                assertThat(jdbc.queryForObject("select version from invitation where id = 1", Long.class)).isEqualTo(7);
                assertThat(jdbc.queryForObject("select count(*) from information_schema.columns where table_schema = ? and table_name = 'invitation' and column_name = 'message'", Integer.class, schema)).isZero();
                assertThat(jdbc.queryForObject("select encrypted_token from invitation where id = 1", String.class)).isEqualTo("encrypted-value");
                assertThat(jdbc.queryForObject("select count(*) from invitation_acceptance", Integer.class)).isEqualTo(1);
                migration.execute(isolated);
                declining.execute(isolated);
                buildSchema(isolated, schema, "validate");
                assertThat(jdbc.queryForObject("select count(*) from registration", Long.class)).isEqualTo(4);
            } finally {
                connection.setSchema(originalSchema);
            }
        } finally {
            administrative.execute("drop schema " + schema + " cascade");
        }
    }

    private void assertConstraintsAndDefault(JdbcTemplate jdbc) {
        jdbc.execute("""
                insert into invitation (group_id, inviter_member_id, type, request_id, token_hash, encrypted_token, expires_at, created_at, updated_at)
                values (1,1,'LINK','00000000-0000-0000-0000-000000000001', repeat('a',64),'encrypted-value', localtimestamp + interval '3 days', localtimestamp,localtimestamp)
                """);
        jdbc.execute("insert into invitation_acceptance (invitation_id,member_id,accepted_at,created_at,updated_at) values (1,1,localtimestamp,localtimestamp,localtimestamp)");
        for (String update : List.of(
                "update invitation set target_member_id=1 where id=1",
                "update invitation set token_hash=null where id=1",
                "update invitation set encrypted_token=null where id=1",
                "update invitation set expires_at=created_at where id=1",
                "update invitation set type='UNKNOWN' where id=1",
                "update invitation set group_id=999 where id=1",
                "update registration set approval_origin=null",
                "update registration set approval_origin='UNKNOWN'",
                "update registration set approval_origin='INVITATION' where status='PENDING'",
                "update registration set approval_origin='INVITATION',decided_by_type=null where status='APPROVED'",
                "insert into invitation_acceptance (invitation_id,member_id,accepted_at,created_at,updated_at) select invitation_id,member_id,accepted_at,created_at,updated_at from invitation_acceptance")) {
            assertThatThrownBy(() -> jdbc.update(update)).as(update).isInstanceOf(DataIntegrityViolationException.class);
        }
        jdbc.execute("""
                insert into registration (id,recruitment_id,member_id,status,registered_at,created_at,updated_at)
                select 100,recruitment_id,member_id,'PENDING',registered_at,created_at,updated_at from registration where status='PENDING'
                """);
        assertThat(jdbc.queryForObject("select approval_origin from registration where id=100", String.class)).isEqualTo("RECRUITMENT");
    }

    private void seedExistingHistory() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            var now = TestSupportConfig.FIXED_NOW;
            Group group = groups.save(Group.createClub("기존 이력 모임", "함께해요", null, null, null, now));
            Member member = members.save(Member.create("우주", 8, "100", Course.BACKEND));
            GroupRecruitment automatic = recruitments.save(GroupRecruitment.create(group, JoinMethod.AUTO, 3, now, now.plusDays(1)));
            GroupRecruitment approval = recruitments.save(GroupRecruitment.create(group, JoinMethod.APPROVAL, 3, now, now.plusDays(1)));
            registrations.save(Registration.createAutoApproved(automatic, member, null, now, 0));
            registrations.save(Registration.createPending(approval, member, null, now));
            registrations.save(Registration.createPending(approval, member, "기존 신청", now).rejectBySystem("이전 미승인", now));
        });
    }

    private void buildSchema(DataSource isolated, String schema, String action) {
        var registry = new StandardServiceRegistryBuilder().applySettings(entityManagerFactory.getProperties())
                .applySetting(AvailableSettings.JAKARTA_NON_JTA_DATASOURCE, isolated)
                .applySetting(AvailableSettings.DEFAULT_SCHEMA, schema)
                .applySetting(AvailableSettings.HBM2DDL_AUTO, action).build();
        try {
            MetadataSources sources = new MetadataSources(registry);
            entityManagerFactory.getMetamodel().getEntities().forEach(entity -> sources.addAnnotatedClass(entity.getJavaType()));
            try (SessionFactory factory = sources.buildMetadata().buildSessionFactory()) {
                assertThat(factory.isOpen()).isTrue();
            }
        } finally {
            StandardServiceRegistryBuilder.destroy(registry);
        }
    }
}
