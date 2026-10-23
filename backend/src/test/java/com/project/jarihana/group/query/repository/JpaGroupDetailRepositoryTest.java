package com.project.jarihana.group.query.repository;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.controller.dto.GroupDetailResponse;
import com.project.jarihana.group.query.repository.dto.GroupDetailMember;
import com.project.jarihana.group.query.repository.dto.GroupDetailProjection;
import com.project.jarihana.group.query.service.dto.GroupDetailResult;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.member.domain.MemberType;
import com.project.jarihana.support.TestSupportConfig;
import jakarta.persistence.EntityManager;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Import(TestSupportConfig.class)
@Transactional
class JpaGroupDetailRepositoryTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 19, 10, 0);

    @Autowired
    private JpaGroupDetailRepository repository;
    @Autowired
    private GroupJpaRepository groupRepository;
    @Autowired
    private GroupMemberJpaRepository groupMemberRepository;
    @Autowired
    private MemberRepository memberRepository;
    @Autowired
    private EntityManager entityManager;

    @DisplayName("상세 조회는 가입 순서, 코치 모임장 정보와 현재 역할을 유지하고 삭제한 구성원을 제외한다.")
    @Test
    void preservesMemberOrderLeaderAndCurrentRole() {
        // Given: 회원 식별자 순서와 가입 순서를 다르게 구성한다.
        Group group = saveGroup("상세조회스터디");
        Member leader = memberRepository.save(Member.create("코치", null, "detail-coach", MemberType.COACH, null));
        Member member = saveMember("가온", "detail-member");
        Member leaving = saveMember("마루", "detail-leaving");
        groupMemberRepository.save(GroupMember.createMember(group, member, NOW));
        groupMemberRepository.save(GroupMember.createLeader(group, leader, NOW));
        GroupMember deleted = groupMemberRepository.save(GroupMember.createMember(group, leaving, NOW));
        groupMemberRepository.delete(deleted);
        Group otherGroup = saveGroup("다른스터디");
        groupMemberRepository.save(GroupMember.createMember(otherGroup, leaving, NOW));
        entityManager.flush();
        entityManager.clear();

        // When
        GroupDetailProjection detail = repository.findById(group.getId(), NOW, member.getId()).orElseThrow();
        GroupDetailResponse response = responseFrom(detail, member.getId());

        // Then
        assertThat(detail.members()).extracting(GroupDetailMember::memberId)
                .containsExactly(member.getId(), leader.getId());
        assertThat(response.memberCount()).isEqualTo(2);
        assertThat(response.leader().memberId()).isEqualTo(leader.getId());
        assertThat(response.leader().crewName()).isEqualTo("코치");
        assertThat(response.leader().generation()).isNull();
        assertThat(response.leader().memberType()).isEqualTo("COACH");
        assertThat(response.leader().avatarUrl()).isEqualTo("https://avatars.githubusercontent.com/u/detail-coach");
        assertThat(response.currentMemberRole()).isEqualTo(GroupMemberRole.MEMBER);
        assertThat(detail.roleOf(leaving.getId())).isNull();
        assertThat(detail.roleOf(null)).isNull();
    }

    @DisplayName("상세 조회에 필요한 구성원 정보는 회원과 가입 엔티티를 영속성 컨텍스트에 적재하지 않는다.")
    @Test
    void readsDetailMembersWithoutHydratingEntities() {
        // Given
        Group group = saveGroup("엔티티조회스터디");
        groupMemberRepository.save(GroupMember.createLeader(group, saveMember("가온", "detail-hydration-1"), NOW));
        groupMemberRepository.save(GroupMember.createMember(group, saveMember("마루", "detail-hydration-2"), NOW));
        entityManager.flush();
        entityManager.clear();
        Statistics statistics = entityManager.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();
        boolean previouslyEnabled = statistics.isStatisticsEnabled();
        statistics.setStatisticsEnabled(true);
        statistics.clear();

        try {
            // When
            GroupDetailProjection detail = repository.findById(group.getId(), NOW, null).orElseThrow();

            // Then
            assertThat(detail.members()).hasSize(2);
            assertThat(statistics.getEntityStatistics(Member.class.getName()).getLoadCount()).isZero();
            assertThat(statistics.getEntityStatistics(GroupMember.class.getName()).getLoadCount()).isZero();
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(3);
        } finally {
            statistics.setStatisticsEnabled(previouslyEnabled);
        }
    }

    @DisplayName("구성원이 없는 상세 조회는 모임장과 현재 역할을 반환하지 않는다.")
    @Test
    void returnsNoLeaderForAnEmptyGroup() {
        // Given
        Group group = saveGroup("빈상세스터디");
        entityManager.flush();
        entityManager.clear();

        // When
        GroupDetailProjection detail = repository.findById(group.getId(), NOW, null).orElseThrow();

        // Then
        assertThat(detail.members()).isEmpty();
        assertThat(responseFrom(detail, null).leader()).isNull();
        assertThat(detail.roleOf(null)).isNull();
    }

    private GroupDetailResponse responseFrom(GroupDetailProjection detail, Long currentMemberId) {
        return GroupDetailResponse.from(new GroupDetailResult(
                detail.group(), detail.group().getDescription(), null, detail.members(),
                detail.activeRecruitment(), detail.approvedCount(), detail.roleOf(currentMemberId),
                detail.currentMemberRegistrationId(), detail.currentMemberRegistrationStatus()
        ));
    }

    private Member saveMember(String name, String githubId) {
        return memberRepository.save(Member.create(name, 8, githubId, Course.BACKEND));
    }

    private Group saveGroup(String name) {
        return groupRepository.save(Group.createStudy(
                name, "함께 학습합니다.", null, null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.MONDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)),
                NOW.minusDays(1)
        ));
    }
}
