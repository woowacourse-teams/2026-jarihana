package com.project.jarihana.group.query.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.GroupRelation;
import com.project.jarihana.group.query.repository.InMemoryGroupDetailRepository;
import com.project.jarihana.group.query.repository.InMemoryGroupListRepository;
import com.project.jarihana.group.query.repository.dto.GroupListMember;
import com.project.jarihana.group.query.repository.dto.GroupListProjection;
import com.project.jarihana.group.query.service.dto.GroupListQuery;
import com.project.jarihana.group.query.service.dto.GroupListResult;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class GroupListServiceTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 19, 12, 0);
    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-08-19T03:00:00Z"),
            ZoneId.of("Asia/Seoul")
    );

    private final InMemoryGroupListRepository listRepository = new InMemoryGroupListRepository();
    private final InMemoryGroupDetailRepository detailRepository = new InMemoryGroupDetailRepository();
    private final CurrentMemberProvider currentMemberProvider = new TestCurrentMemberProvider();
    private final GroupQueryService service = new GroupQueryService(
            listRepository,
            detailRepository,
            currentMemberProvider,
            CLOCK
    );

    @BeforeEach
    void setUp() {
        listRepository.clear();
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

    @Test
    void filtersByTypeAndKeyword() {
        // Given
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

    @Test
    void filtersJoinedLeaderGroupsAndRecruitingGroups() {
        // Given
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

    private static class TestCurrentMemberProvider extends CurrentMemberProvider {

        @Override
        public Optional<Long> currentMemberId() {
            return Optional.of(10L);
        }
    }
}
