package com.project.jarihana.groupmember.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.groupmember.query.repository.GroupMemberListRepository;
import com.project.jarihana.groupmember.query.repository.dto.GroupMemberListPage;
import com.project.jarihana.groupmember.query.repository.dto.GroupMemberListProjection;
import com.project.jarihana.groupmember.query.repository.dto.GroupMemberListSearchCriteria;
import com.project.jarihana.groupmember.query.service.dto.GroupMemberListQuery;
import com.project.jarihana.groupmember.query.service.dto.GroupMemberListResult;
import com.project.jarihana.member.domain.Course;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GroupMemberQueryServiceTest {

    private static final long GROUP_ID = 1L;
    private static final LocalDateTime JOINED_AT = LocalDateTime.of(2026, 8, 19, 10, 0);

    private final FakeGroupMemberListRepository repository = new FakeGroupMemberListRepository();
    private final GroupMemberQueryService service = new GroupMemberQueryService(repository);

    private static Stream<String> invalidCursors() {
        return Stream.of(
                "invalid-cursor",
                encodeCursor("invalid"),
                encodeCursor("not-a-date|1"),
                encodeCursor("2026-08-19T10:00|0")
        );
    }

    @DisplayName("그룹 구성원 목록을 조회하고 다음 커서를 생성한다.")
    @Test
    void findsGroupMembersAndCreatesNextCursor() {
        // Given
        repository.registerGroup(GROUP_ID);
        repository.givenPage(new GroupMemberListPage(
                List.of(
                        projection(102L, 202L, "마루", Course.FRONTEND, GroupMemberRole.MEMBER,
                                JOINED_AT.plusHours(1)),
                        projection(101L, 201L, "가온", Course.BACKEND, GroupMemberRole.LEADER, JOINED_AT)
                ),
                true
        ));

        // When
        GroupMemberListResult result = service.findGroupMembers(GROUP_ID, new GroupMemberListQuery(null, 2));

        // Then
        assertThat(result.items()).containsExactly(
                new GroupMemberListResult.Item(
                        102L,
                        202L,
                        "마루",
                        8,
                        "FRONTEND",
                        "MEMBER",
                        JOINED_AT.plusHours(1)
                ),
                new GroupMemberListResult.Item(
                        101L,
                        201L,
                        "가온",
                        8,
                        "BACKEND",
                        "LEADER",
                        JOINED_AT
                )
        );
        assertThat(decodeCursor(result.nextCursor())).isEqualTo("2026-08-19T10:00|101");
        assertThat(result.hasNext()).isTrue();
    }

    private static GroupMemberListProjection projection(
            Long groupMemberId,
            Long memberId,
            String crewName,
            Course course,
            GroupMemberRole role,
            LocalDateTime joinedAt
    ) {
        return new GroupMemberListProjection(
                groupMemberId,
                memberId,
                crewName,
                8,
                course,
                role,
                joinedAt
        );
    }

    private static String decodeCursor(String cursor) {
        return new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
    }

    @DisplayName("커서를 해석해 다음 그룹 구성원 페이지를 조회한다.")
    @Test
    void findsNextPageWithDecodedCursor() {
        // Given
        repository.registerGroup(GROUP_ID);
        repository.givenPage(new GroupMemberListPage(List.of(), false));
        String cursor = encodeCursor("2026-08-19T11:00|102");

        // When
        GroupMemberListResult result = service.findGroupMembers(GROUP_ID, new GroupMemberListQuery(cursor, 20));

        // Then
        assertThat(repository.lastCriteria()).isEqualTo(new GroupMemberListSearchCriteria(
                GROUP_ID,
                JOINED_AT.plusHours(1),
                102L
        ));
        assertThat(repository.lastSize()).isEqualTo(20);
        assertThat(result.items()).isEmpty();
        assertThat(result.nextCursor()).isNull();
        assertThat(result.hasNext()).isFalse();
    }

    private static String encodeCursor(String value) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    @DisplayName("그룹 식별자가 유효하지 않으면 예외가 발생한다.")
    @NullSource
    @ValueSource(longs = {0L, -1L})
    @ParameterizedTest
    void rejectsInvalidGroupId(Long groupId) {
        // Given
        GroupMemberListQuery query = new GroupMemberListQuery(null, 20);

        // When / Then
        assertInvalidParameter(() -> service.findGroupMembers(groupId, query));
    }

    private static void assertInvalidParameter(Runnable invocation) {
        assertThatThrownBy(invocation::run)
                .isInstanceOf(BusinessException.class)
                .extracting(
                        exception -> ((BusinessException) exception).getErrorCode(),
                        Throwable::getMessage
                )
                .containsExactly(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
    }

    @DisplayName("조회 조건이 없으면 예외가 발생한다.")
    @Test
    void rejectsNullQuery() {
        // Given / When / Then
        assertInvalidParameter(() -> service.findGroupMembers(GROUP_ID, null));
    }

    @DisplayName("페이지 크기가 범위를 벗어나면 예외가 발생한다.")
    @ValueSource(ints = {0, 101})
    @ParameterizedTest
    void rejectsInvalidSize(int size) {
        // Given
        GroupMemberListQuery query = new GroupMemberListQuery(null, size);

        // When / Then
        assertInvalidParameter(() -> service.findGroupMembers(GROUP_ID, query));
    }

    @DisplayName("커서 형식이 유효하지 않으면 예외가 발생한다.")
    @MethodSource("invalidCursors")
    @ParameterizedTest
    void rejectsInvalidCursor(String cursor) {
        // Given
        GroupMemberListQuery query = new GroupMemberListQuery(cursor, 20);

        // When / Then
        assertInvalidParameter(() -> service.findGroupMembers(GROUP_ID, query));
    }

    @DisplayName("존재하지 않는 그룹이면 예외가 발생한다.")
    @Test
    void rejectsUnknownGroup() {
        // Given
        GroupMemberListQuery query = new GroupMemberListQuery(null, 20);

        // When / Then
        assertThatThrownBy(() -> service.findGroupMembers(GROUP_ID, query))
                .isInstanceOf(BusinessException.class)
                .extracting(
                        exception -> ((BusinessException) exception).getErrorCode(),
                        Throwable::getMessage
                )
                .containsExactly(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다.");
        assertThat(repository.findPageCallCount()).isZero();
    }

    private static class FakeGroupMemberListRepository implements GroupMemberListRepository {

        private Long existingGroupId;
        private GroupMemberListPage page = new GroupMemberListPage(List.of(), false);
        private GroupMemberListSearchCriteria lastCriteria;
        private int lastSize;
        private int findPageCallCount;

        @Override
        public boolean existsGroupById(Long groupId) {
            return existingGroupId != null && existingGroupId.equals(groupId);
        }

        @Override
        public GroupMemberListPage findPage(GroupMemberListSearchCriteria criteria, int size) {
            lastCriteria = criteria;
            lastSize = size;
            findPageCallCount++;
            return page;
        }

        void registerGroup(Long groupId) {
            existingGroupId = groupId;
        }

        void givenPage(GroupMemberListPage page) {
            this.page = page;
        }

        GroupMemberListSearchCriteria lastCriteria() {
            return lastCriteria;
        }

        int lastSize() {
            return lastSize;
        }

        int findPageCallCount() {
            return findPageCallCount;
        }
    }
}
