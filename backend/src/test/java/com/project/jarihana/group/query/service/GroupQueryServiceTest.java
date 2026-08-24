package com.project.jarihana.group.query.service;

import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.GroupRelation;
import com.project.jarihana.group.query.repository.InMemoryGroupDetailRepository;
import com.project.jarihana.group.query.repository.InMemoryGroupListRepository;
import com.project.jarihana.group.query.repository.dto.GroupDetailMember;
import com.project.jarihana.group.query.repository.dto.GroupDetailProjection;
import com.project.jarihana.group.query.repository.dto.GroupListMember;
import com.project.jarihana.group.query.repository.dto.GroupListProjection;
import com.project.jarihana.group.query.service.dto.GroupDetailResult;
import com.project.jarihana.group.query.service.dto.GroupListQuery;
import com.project.jarihana.group.query.service.dto.GroupListResult;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.*;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GroupQueryServiceTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 19, 12, 0);
    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-08-19T03:00:00Z"),
            ZoneId.of("Asia/Seoul")
    );

    private final InMemoryGroupListRepository listRepository = new InMemoryGroupListRepository();
    private final InMemoryGroupDetailRepository detailRepository = new InMemoryGroupDetailRepository();
    private final LoginMemberReader loginMemberReader = new TestLoginMemberReader();
    private final GroupQueryService service = new GroupQueryService(
            listRepository,
            detailRepository,
            loginMemberReader,
            CLOCK
    );

    @BeforeEach
    void setUp() {
        listRepository.clear();
        detailRepository.clear();
    }

    @DisplayName("그룹 유형과 검색어로 활성 그룹 목록을 필터링한다.")
    @Test
    void filtersByTypeAndKeyword() {
        // Given
        saveGroupListFixtures();
        GroupListQuery query = new GroupListQuery(
                GroupStatus.ACTIVE,
                null,
                null,
                GroupType.STUDY,
                false,
                "알고리즘",
                null,
                20
        );

        // When
        GroupListResult result = service.findGroups(query);

        // Then
        assertThat(result.items()).extracting(projection -> projection.id()).containsExactly(1L);
    }

    private void saveGroupListFixtures() {
        Group study = study("알고리즘 스터디", "함께 문제를 풉니다.", NOW.minusHours(2));
        listRepository.save(GroupListProjection.of(
                1L,
                study,
                2,
                List.of(GroupListMember.of(10L, member("가온"), GroupMemberRole.LEADER)),
                GroupRecruitment.create(
                        study,
                        JoinMethod.APPROVAL,
                        8,
                        NOW.minusDays(1),
                        NOW.plusDays(1)
                ),
                3
        ));
        listRepository.save(GroupListProjection.of(
                2L,
                study("주말 동아리", "취미를 함께 나눠요.", NOW.minusHours(1)),
                4,
                List.of(GroupListMember.of(20L, member("바다"), GroupMemberRole.MEMBER)),
                null,
                0
        ));
    }

    private static Group study(String name, String introduction, LocalDateTime createdAt) {
        return Group.createStudy(
                name,
                introduction,
                null,
                null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.MONDAY), LocalTime.NOON, LocalTime.of(13, 0)),
                createdAt
        );
    }

    private static Member member(String crewName) {
        return Member.create(crewName, 8, "github-" + crewName, Course.BACKEND);
    }

    @DisplayName("가입한 그룹 중 리더이며 모집 중인 그룹만 조회한다.")
    @Test
    void filtersJoinedLeaderGroupsAndRecruitingGroups() {
        // Given
        saveGroupListFixtures();
        GroupListQuery query = new GroupListQuery(
                GroupStatus.ACTIVE,
                GroupRelation.JOINED,
                GroupMemberRole.LEADER,
                null,
                true,
                null,
                null,
                20
        );

        // When
        GroupListResult result = service.findGroups(query);

        // Then
        assertThat(result.items()).extracting(projection -> projection.id()).containsExactly(1L);
    }

    @DisplayName("관계 조건 없이 역할 필터를 사용하면 예외가 발생한다.")
    @Test
    void rejectsRoleFilterWithoutRelation() {
        // Given
        GroupListQuery query = new GroupListQuery(
                GroupStatus.ACTIVE,
                null,
                GroupMemberRole.LEADER,
                null,
                false,
                null,
                null,
                20
        );

        // When / Then
        assertThatThrownBy(() -> service.findGroups(query))
                .isInstanceOf(BusinessException.class)
                .extracting(
                        exception -> ((BusinessException) exception).getErrorCode(),
                        Throwable::getMessage
                )
                .containsExactly(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
    }

    @DisplayName("그룹 상세 정보를 조회한다.")
    @Test
    void findsGroupDetail() {
        // Given
        Group group = Group.createStudy(
                "알고리즘 스터디",
                "함께 문제를 풉니다.",
                "문제 풀이와 코드 리뷰를 진행합니다.",
                "groups/1.webp",
                RecurringGroupSchedule.of(
                        Set.of(DayOfWeek.MONDAY),
                        LocalTime.of(19, 0),
                        LocalTime.of(21, 0)
                ),
                NOW
        );
        Member leader = Member.create("가온", 8, "github-1", Course.BACKEND);
        detailRepository.save(GroupDetailProjection.of(
                1L,
                group,
                List.of(GroupDetailMember.of(10L, leader, GroupMemberRole.LEADER)),
                null,
                0
        ));

        // When
        GroupDetailResult result = service.findGroup(1L);

        // Then
        assertThat(result.group()).isSameAs(group);
        assertThat(result.members()).hasSize(1);
        assertThat(result.leader().memberId()).isEqualTo(10L);
    }

    @DisplayName("존재하지 않는 그룹 상세 조회 시 예외가 발생한다.")
    @Test
    void rejectsUnknownGroup() {
        // Given

        // When / Then
        assertThatThrownBy(() -> service.findGroup(99L))
                .isInstanceOf(BusinessException.class)
                .extracting(
                        exception -> ((BusinessException) exception).getErrorCode(),
                        Throwable::getMessage
                )
                .containsExactly(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다.");
    }

    private static class TestLoginMemberReader extends LoginMemberReader {

        @Override
        public Optional<Long> currentMemberId() {
            return Optional.of(10L);
        }
    }
}
