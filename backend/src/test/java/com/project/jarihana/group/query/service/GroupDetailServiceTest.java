package com.project.jarihana.group.query.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.InMemoryGroupDetailRepository;
import com.project.jarihana.group.query.repository.InMemoryGroupListRepository;
import com.project.jarihana.group.query.repository.dto.GroupDetailMember;
import com.project.jarihana.group.query.repository.dto.GroupDetailProjection;
import com.project.jarihana.group.query.service.dto.GroupDetailResult;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.LocalTime;
import java.time.DayOfWeek;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class GroupDetailServiceTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 19, 12, 0);
    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-08-19T03:00:00Z"),
            ZoneId.of("Asia/Seoul")
    );

    private final InMemoryGroupListRepository listRepository = new InMemoryGroupListRepository();
    private final InMemoryGroupDetailRepository detailRepository = new InMemoryGroupDetailRepository();
    private final CurrentMemberProvider currentMemberProvider = new AnonymousCurrentMemberProvider();
    private final GroupQueryService service = new GroupQueryService(
            listRepository,
            detailRepository,
            currentMemberProvider,
            CLOCK
    );

    @BeforeEach
    void setUp() {
        detailRepository.clear();
    }

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
}
