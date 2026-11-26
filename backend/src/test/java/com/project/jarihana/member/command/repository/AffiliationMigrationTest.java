package com.project.jarihana.member.command.repository;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 소속 마이그레이션이 크루 명단에 있는 크루를 우아한테크코스 소속으로 옮기는지 확인한다.
 *
 * <p>애플리케이션 테스트 DB는 회원이 없는 상태에서 마이그레이션되므로, 회원이 있는 DB에 같은 SQL을 따로 실행한다.
 */
class AffiliationMigrationTest {

    @DisplayName("크루 명단에 있는 크루만 우아한테크코스 소속을 얻고, 명단 밖 크루와 코치, 기본 멤버는 얻지 않는다.")
    @Test
    void movesExistingCrewToWootecoAffiliation() throws Exception {
        // Given
        String url = "jdbc:tc:postgresql:17:///affiliation_migration_test";
        String migration = Files.readString(Path.of("src/main/resources/db/migration/V52__affiliation.sql"));
        try (var connection = DriverManager.getConnection(url); var statement = connection.createStatement()) {
            statement.execute("CREATE TABLE member (id BIGINT PRIMARY KEY, github_id VARCHAR(50) NOT NULL, member_type VARCHAR(20) NOT NULL)");
            statement.execute("CREATE TABLE crew_roster (github_id VARCHAR(50) PRIMARY KEY)");
            statement.execute("INSERT INTO crew_roster VALUES ('1001'), ('1002'), ('1003'), ('1004')");
            statement.execute("""
                    INSERT INTO member VALUES (1, '1001', 'CREW'), (2, '1002', 'COACH'), (3, '1003', 'MEMBER'),
                                              (4, '1004', 'CREW'), (5, '1005', 'BOOTCAMP'), (6, '1006', 'CREW')
                    """);

            // When
            statement.execute(migration);

            // Then
            List<Long> members = new ArrayList<>();
            try (var rows = statement.executeQuery("""
                    SELECT membership.member_id
                    FROM member_affiliation membership
                             JOIN affiliation ON affiliation.id = membership.affiliation_id
                    WHERE affiliation.code = 'WOOTECO'
                    ORDER BY membership.member_id
                    """)) {
                while (rows.next()) {
                    members.add(rows.getLong(1));
                }
            }
            assertThat(members).containsExactly(1L, 4L);
        }
    }
}
