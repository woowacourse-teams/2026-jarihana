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
 * 이전 버전의 Hibernate는 visibility와 visible_affiliation_id를 빼고 INSERT와 UPDATE를 보내므로, 그 문장을 그대로 흉내 낸다.
 */
class GroupVisibilityMigrationTest extends IntegrationTestSupport {

    @Autowired
    private JdbcTemplate jdbc;

    @DisplayName("이전 버전이 공개 범위 없이 만든 모임은 소속 없는 전체 공개가 된다.")
    @Test
    void legacyInsertBecomesPublic() {
        // When
        long id = insertLikePreviousVersion("이전 버전 모임");

        // Then
        assertThat(jdbc.queryForObject("select visibility from groups where id = ?", String.class, id))
                .isEqualTo("PUBLIC");
        assertThat(jdbc.queryForObject("select visible_affiliation_id from groups where id = ?", Long.class, id))
                .isNull();
    }

    @DisplayName("이전 버전이 모임을 수정해도 소속 공개 설정이 풀리지 않는다.")
    @Test
    void legacyUpdateKeepsAffiliationOnly() {
        // Given
        long id = insertLikePreviousVersion("소속 공개 모임");
        long wooteco = wootecoAffiliationId();
        jdbc.update("update groups set visibility = 'AFFILIATION_ONLY', visible_affiliation_id = ? where id = ?", wooteco, id);

        // When
        jdbc.update("""
                update groups
                set name = ?, introduction = ?, version = version + 1, updated_at = now()
                where id = ? and version = 0
                """, "이전 버전이 고친 이름", "이전 버전이 고친 소개", id);

        // Then
        assertThat(jdbc.queryForObject("select visibility from groups where id = ?", String.class, id))
                .isEqualTo("AFFILIATION_ONLY");
        assertThat(jdbc.queryForObject("select visible_affiliation_id from groups where id = ?", Long.class, id))
                .isEqualTo(wooteco);
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

    @DisplayName("소속 공개에는 소속이 있어야 하고, 다른 공개 범위에는 소속을 둘 수 없다.")
    @Test
    void requiresAffiliationOnlyForAffiliationOnly() {
        // Given
        long id = insertLikePreviousVersion("검증 모임");
        long wooteco = wootecoAffiliationId();

        // When & Then
        assertThatThrownBy(() -> jdbc.update("update groups set visibility = 'AFFILIATION_ONLY' where id = ?", id))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("update groups set visible_affiliation_id = ? where id = ?", wooteco, id))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("""
                update groups set visibility = 'AFFILIATION_ONLY', visible_affiliation_id = -1 where id = ?
                """, id))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @DisplayName("우아한테크코스 소속이 마이그레이션으로 들어가 있다.")
    @Test
    void seedsWootecoAffiliation() {
        // When & Then
        assertThat(jdbc.queryForObject("select name from affiliation where code = 'WOOTECO'", String.class))
                .isEqualTo("우아한테크코스");
    }

    private long wootecoAffiliationId() {
        return jdbc.queryForObject("select id from affiliation where code = 'WOOTECO'", Long.class);
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
