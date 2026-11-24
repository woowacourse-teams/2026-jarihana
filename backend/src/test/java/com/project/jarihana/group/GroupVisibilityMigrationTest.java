package com.project.jarihana.group;

import com.project.jarihana.support.IntegrationTestSupport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Blue-Green 배포 중에는 공개 범위를 모르는 이전 버전이 같은 groups 테이블을 함께 쓴다.
 * 이전 버전의 Hibernate는 visibility를 빼고 INSERT와 UPDATE를 보내므로, 그 문장을 그대로 흉내 낸다.
 */
class GroupVisibilityMigrationTest extends IntegrationTestSupport {

    @Autowired
    private JdbcTemplate jdbc;

    @DisplayName("이전 버전이 visibility 없이 만든 모임은 전체 공개가 된다.")
    @Test
    void legacyInsertBecomesPublic() {
        // When
        long id = insertLikePreviousVersion("이전 버전 모임");

        // Then
        assertThat(jdbc.queryForObject("select visibility from groups where id = ?", String.class, id))
                .isEqualTo("PUBLIC");
    }

    @DisplayName("이전 버전이 모임을 수정해도 크루 전용 설정이 풀리지 않는다.")
    @Test
    void legacyUpdateKeepsCrewOnly() {
        // Given
        long id = insertLikePreviousVersion("크루 전용 모임");
        jdbc.update("update groups set visibility = 'CREW_ONLY' where id = ?", id);

        // When
        jdbc.update("""
                update groups
                set name = ?, introduction = ?, version = version + 1, updated_at = now()
                where id = ? and version = 0
                """, "이전 버전이 고친 이름", "이전 버전이 고친 소개", id);

        // Then
        assertThat(jdbc.queryForObject("select visibility from groups where id = ?", String.class, id))
                .isEqualTo("CREW_ONLY");
    }

    @DisplayName("정해진 공개 범위 외의 값은 저장할 수 없다.")
    @Test
    void rejectsUnknownVisibility() {
        // Given
        long id = insertLikePreviousVersion("검증 모임");

        // When & Then
        assertThatThrownBy(() -> jdbc.update("update groups set visibility = 'SECRET' where id = ?", id))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private long insertLikePreviousVersion(String name) {
        return jdbc.queryForObject("""
                insert into groups (version, type, meeting_type, location, show_base_schedule_in_calendar,
                                    name, introduction, status, created_at, updated_at)
                values (0, 'CLUB', 'FLEXIBLE', null, true, ?, '소개', 'ACTIVE', now(), now())
                returning id
                """, Long.class, name);
    }
}
