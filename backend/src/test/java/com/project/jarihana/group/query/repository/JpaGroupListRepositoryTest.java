package com.project.jarihana.group.query.repository;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.dto.GroupListMember;
import com.project.jarihana.group.query.repository.dto.GroupListPage;
import com.project.jarihana.group.query.repository.dto.GroupListProjection;
import com.project.jarihana.group.query.repository.dto.GroupListSearchCriteria;
import com.project.jarihana.group.query.service.GroupQueryService;
import com.project.jarihana.group.query.service.dto.GroupListQuery;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.member.domain.MemberType;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.recruitment.query.repository.GroupRecruitmentJpaRepository;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.DecisionActor;
import com.project.jarihana.support.TestSupportConfig;
import jakarta.persistence.EntityManager;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Import(TestSupportConfig.class)
@Sql(scripts = "/sql/truncate.sql", executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Transactional
class JpaGroupListRepositoryTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 19, 10, 0);

    @Autowired
    private JpaGroupListRepository repository;
    @Autowired
    private GroupQueryService service;
    @Autowired
    private GroupJpaRepository groupRepository;
    @Autowired
    private GroupMemberJpaRepository groupMemberRepository;
    @Autowired
    private MemberRepository memberRepository;
    @Autowired
    private GroupRecruitmentJpaRepository recruitmentRepository;
    @Autowired
    private RegistrationJpaRepository registrationRepository;
    @Autowired
    private EntityManager entityManager;

    @DisplayName("목록 구성원은 모임별 가입 순서, 모임장과 현재 역할을 유지하고 삭제한 소속을 제외한다.")
    @Test
    void preservesGroupingMemberOrderLeaderAndRoles() {
        // Given: 회원 식별자 순서와 가입 순서를 다르게 구성한다.
        Group group = saveGroup("목록조회스터디");
        Group other = saveGroup("다른목록스터디");
        Member leader = memberRepository.save(Member.create("코치", null, "list-coach", MemberType.COACH, null));
        Member member = saveMember("가온", "list-member");
        Member leaving = saveMember("마루", "list-leaving");
        groupMemberRepository.save(GroupMember.createMember(group, member, NOW));
        groupMemberRepository.save(GroupMember.createLeader(group, leader, NOW));
        GroupMember deleted = groupMemberRepository.save(GroupMember.createMember(group, leaving, NOW));
        groupMemberRepository.delete(deleted);
        groupMemberRepository.save(GroupMember.createLeader(other, leaving, NOW));
        entityManager.flush();
        entityManager.clear();

        // When
        GroupListPage page = repository.findPage(criteria(null, null), 20);
        GroupListProjection item = page.items().stream().filter(row -> row.id().equals(group.getId())).findFirst().orElseThrow();

        // Then
        assertThat(page.items()).extracting(GroupListProjection::id).containsExactly(other.getId(), group.getId());
        assertThat(item.members()).extracting(GroupListMember::memberId).containsExactly(member.getId(), leader.getId());
        assertThat(item.memberCount()).isEqualTo(2);
        assertThat(item.leader().memberId()).isEqualTo(leader.getId());
        assertThat(item.hasRole(member.getId(), GroupMemberRole.MEMBER)).isTrue();
        assertThat(item.hasMember(leaving.getId())).isFalse();
        var result = service.findGroups(new GroupListQuery(GroupStatus.ACTIVE, null, null, null, null, null, null, null, null, 20));
        var resultLeader = result.items().stream().filter(row -> row.id().equals(group.getId())).findFirst().orElseThrow().leader();
        assertThat(resultLeader.crewName()).isEqualTo("코치");
        assertThat(resultLeader.generation()).isNull();
        assertThat(resultLeader.memberType()).isEqualTo(MemberType.COACH);
        assertThat(resultLeader.avatarUrl()).isEqualTo("https://avatars.githubusercontent.com/u/list-coach");
    }

    @DisplayName("목록 구성원 일괄 조회는 회원과 소속 엔티티를 적재하지 않고 페이지 크기와 무관하게 세 쿼리를 사용한다.")
    @Test
    void readsListMembersWithoutHydratingEntities() {
        // Given
        Group first = saveGroup("첫번째목록");
        Group second = saveGroup("두번째목록");
        groupMemberRepository.save(GroupMember.createLeader(first, saveMember("가온", "list-hydration-1"), NOW));
        groupMemberRepository.save(GroupMember.createLeader(second, saveMember("마루", "list-hydration-2"), NOW));
        entityManager.flush();
        entityManager.clear();
        Statistics statistics = entityManager.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();
        boolean previouslyEnabled = statistics.isStatisticsEnabled();
        statistics.setStatisticsEnabled(true);
        statistics.clear();

        try {
            // When
            GroupListPage page = repository.findPage(criteria(null, null), 20);

            // Then
            assertThat(page.items()).hasSize(2);
            assertThat(statistics.getEntityStatistics(Member.class.getName()).getLoadCount()).isZero();
            assertThat(statistics.getEntityStatistics(GroupMember.class.getName()).getLoadCount()).isZero();
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(3);
        } finally {
            statistics.setStatisticsEnabled(previouslyEnabled);
        }
    }

    @DisplayName("동일 생성 시각의 목록은 식별자로 커서를 이어가며 빈 모임과 마지막 페이지를 유지한다.")
    @Test
    void preservesCursorAndEmptyGroup() {
        // Given
        Group first = saveGroup("먼저생성목록");
        Group second = saveGroup("나중생성목록");
        entityManager.flush();
        entityManager.clear();

        // When
        GroupListPage page = repository.findPage(criteria(null, null), 1);
        GroupListPage next = repository.findPage(criteria(second.getCreatedAt(), second.getId()), 1);
        GroupListPage empty = repository.findPage(criteria(first.getCreatedAt(), first.getId()), 1);

        // Then
        assertThat(page.items()).extracting(GroupListProjection::id).containsExactly(second.getId());
        assertThat(page.hasNext()).isTrue();
        assertThat(page.items().getFirst().members()).isEmpty();
        assertThat(page.items().getFirst().memberCount()).isZero();
        assertThat(page.items().getFirst().leader()).isNull();
        assertThat(next.items()).extracting(GroupListProjection::id).containsExactly(first.getId());
        assertThat(next.hasNext()).isFalse();
        assertThat(empty.items()).isEmpty();
        assertThat(empty.hasNext()).isFalse();
    }

    @DisplayName("목록은 가장 최근 활성 모집과 해당 모집의 승인 인원만 결합한다.")
    @Test
    void preservesLatestRecruitmentAndApprovedCount() {
        // Given
        Group group = saveGroup("모집중목록");
        GroupRecruitment older = recruitmentRepository.save(GroupRecruitment.create(group, JoinMethod.AUTO, 10, NOW.minusDays(2), null));
        GroupRecruitment latest = recruitmentRepository.save(GroupRecruitment.create(group, JoinMethod.AUTO, 10, NOW.minusDays(1), NOW.plusDays(1)));
        recruitmentRepository.save(GroupRecruitment.create(group, JoinMethod.AUTO, 10, NOW.minusDays(2), NOW));
        recruitmentRepository.save(GroupRecruitment.create(group, JoinMethod.AUTO, 10, NOW.plusHours(1), null));
        registrationRepository.save(Registration.createAutoApproved(older, saveMember("가온", "list-older"), null, NOW, 0));
        registrationRepository.save(Registration.createAutoApproved(latest, saveMember("마루", "list-latest"), null, NOW, 0));
        GroupRecruitment invitationRecruitment = recruitmentRepository.save(GroupRecruitment.create(group, JoinMethod.APPROVAL, 10, NOW.minusDays(1), null));
        registrationRepository.save(Registration.createPending(invitationRecruitment, saveMember("나루", "list-invited"), null, NOW).approveByInvitation(NOW));
        registrationRepository.save(Registration.createPending(invitationRecruitment, saveMember("바다", "list-approved"), null, NOW)
                .approve(DecisionActor.member(saveMember("하늘", "list-approver").getId()), NOW, 0));
        entityManager.flush();
        entityManager.clear();

        // When
        GroupListProjection item = repository.findPage(criteria(null, null), 20).items().getFirst();

        // Then
        assertThat(item.activeRecruitment().getId()).isEqualTo(invitationRecruitment.getId());
        assertThat(item.approvedCount()).isEqualTo(1);
        assertThat(item.memberCount()).isZero();
    }

    private GroupListSearchCriteria criteria(LocalDateTime cursorTime, Long cursorId) {
        return new GroupListSearchCriteria(GroupStatus.ACTIVE, null, null, null, null, false, null, null, null, NOW, cursorTime, cursorId);
    }

    private Member saveMember(String name, String githubId) {
        return memberRepository.save(Member.create(name, 8, githubId, Course.BACKEND));
    }

    private Group saveGroup(String name) {
        return groupRepository.save(Group.createStudy(name, "함께 학습합니다.", null, null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.MONDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)), NOW.minusDays(1)));
    }
}
