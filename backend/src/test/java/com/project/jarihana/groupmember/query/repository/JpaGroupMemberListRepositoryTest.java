package com.project.jarihana.groupmember.query.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.query.repository.dto.GroupMemberListPage;
import com.project.jarihana.groupmember.query.repository.dto.GroupMemberListProjection;
import com.project.jarihana.groupmember.query.repository.dto.GroupMemberListSearchCriteria;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.TestSupportConfig;
import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Import(TestSupportConfig.class)
@Transactional
class JpaGroupMemberListRepositoryTest {

    private static final LocalDateTime JOINED_AT = LocalDateTime.of(2026, 8, 19, 10, 0);

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private GroupMemberListJpaRepository groupMemberJpaRepository;

    @Autowired
    private JpaGroupMemberListRepository repository;

    @DisplayName("가입 시각과 식별자 역순으로 그룹 구성원을 커서 조회한다.")
    @Test
    void findsGroupMembersWithCursorPagination() {
        // Given
        Group group = saveGroup("저장소조회스터디");
        GroupMember leader = saveGroupMember(group, "가온", "repository-1", Course.BACKEND, true, JOINED_AT);
        GroupMember firstMember = saveGroupMember(
                group,
                "마루",
                "repository-2",
                Course.FRONTEND,
                false,
                JOINED_AT.plusHours(1)
        );
        GroupMember latestMember = saveGroupMember(
                group,
                "해음",
                "repository-3",
                Course.ANDROID,
                false,
                JOINED_AT.plusHours(1)
        );

        // When
        GroupMemberListPage firstPage = repository.findPage(
                new GroupMemberListSearchCriteria(group.getId(), null, null),
                2
        );
        GroupMemberListProjection cursorMember = firstPage.items().get(1);
        GroupMemberListPage secondPage = repository.findPage(
                new GroupMemberListSearchCriteria(
                        group.getId(),
                        cursorMember.joinedAt(),
                        cursorMember.groupMemberId()
                ),
                2
        );

        // Then
        assertThat(firstPage.items())
                .extracting(GroupMemberListProjection::groupMemberId)
                .containsExactly(latestMember.getId(), firstMember.getId());
        assertThat(firstPage.hasNext()).isTrue();
        assertThat(secondPage.items())
                .extracting(GroupMemberListProjection::groupMemberId)
                .containsExactly(leader.getId());
        assertThat(secondPage.hasNext()).isFalse();
    }

    @DisplayName("Hard Delete된 그룹 구성원은 목록 조회에서 제외한다.")
    @Test
    void excludesHardDeletedGroupMember() {
        // Given
        Group group = saveGroup("구성원삭제스터디");
        GroupMember leader = saveGroupMember(group, "가온", "repository-4", Course.BACKEND, true, JOINED_AT);
        GroupMember leavingMember = saveGroupMember(
                group,
                "마루",
                "repository-5",
                Course.FRONTEND,
                false,
                JOINED_AT.plusHours(1)
        );

        // When
        groupMemberJpaRepository.delete(leavingMember);
        groupMemberJpaRepository.flush();
        GroupMemberListPage page = repository.findPage(
                new GroupMemberListSearchCriteria(group.getId(), null, null),
                20
        );

        // Then
        assertThat(groupMemberJpaRepository.findById(leavingMember.getId())).isEmpty();
        assertThat(page.items())
                .extracting(GroupMemberListProjection::groupMemberId)
                .containsExactly(leader.getId());
        assertThat(page.hasNext()).isFalse();
    }

    private Group saveGroup(String name) {
        return groupRepository.save(Group.createStudy(
                name,
                "함께 학습합니다.",
                null,
                null,
                RecurringGroupSchedule.of(
                        Set.of(DayOfWeek.MONDAY),
                        LocalTime.of(19, 0),
                        LocalTime.of(21, 0)
                ),
                JOINED_AT.minusDays(1)
        ));
    }

    private GroupMember saveGroupMember(
            Group group,
            String crewName,
            String githubId,
            Course course,
            boolean leader,
            LocalDateTime joinedAt
    ) {
        Member member = memberRepository.save(Member.create(crewName, 8, githubId, course));
        GroupMember groupMember = leader
                ? GroupMember.createLeader(group, member, joinedAt)
                : GroupMember.createMember(group, member, joinedAt);
        return groupMemberJpaRepository.save(groupMember);
    }
}
