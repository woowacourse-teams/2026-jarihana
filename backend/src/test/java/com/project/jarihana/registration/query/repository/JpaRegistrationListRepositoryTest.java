package com.project.jarihana.registration.query.repository;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.recruitment.query.repository.GroupRecruitmentJpaRepository;
import com.project.jarihana.registration.command.repository.RegistrationCommandRepository;
import com.project.jarihana.registration.domain.DecisionActor;
import com.project.jarihana.registration.domain.DecisionActorType;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.RegistrationStatus;
import com.project.jarihana.registration.query.repository.dto.*;
import com.project.jarihana.support.TestSupportConfig;
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
class JpaRegistrationListRepositoryTest {

    private static final LocalDateTime NOW = TestSupportConfig.FIXED_NOW;

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private GroupMemberJpaRepository groupMemberRepository;

    @Autowired
    private GroupRecruitmentJpaRepository recruitmentRepository;

    @Autowired
    private RegistrationCommandRepository registrationCommandRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private JpaRegistrationListRepository repository;

    @DisplayName("신청 상태와 등록 시각·식별자 역순으로 신청자 목록을 커서 조회한다.")
    @Test
    void findsRegistrationsWithStatusAndCursorPagination() {
        // Given
        Member leader = saveMember("조회가온", Course.BACKEND, "registration-repository-leader");
        Group group = saveGroup("신청자 저장소 스터디");
        groupMemberRepository.save(GroupMember.createLeader(group, leader, NOW));
        GroupRecruitment recruitment = recruitmentRepository.save(GroupRecruitment.create(
                group, JoinMethod.APPROVAL, 3, NOW.minusDays(1), NOW.plusDays(1)));
        Member approvedApplicant = saveMember("조회마루", Course.FRONTEND, "registration-repository-approved");
        Member pendingApplicant = saveMember("조회누리", Course.ANDROID, "registration-repository-pending");
        Member rejectedApplicant = saveMember("조회해음", Course.BACKEND, "registration-repository-rejected");
        Registration approved = registrationCommandRepository.save(Registration.createPending(
                recruitment, approvedApplicant, null, NOW));
        registrationCommandRepository.save(approved.approve(
                DecisionActor.member(leader.getId()), NOW, 0));
        Registration pending = registrationCommandRepository.save(Registration.createPending(
                recruitment, pendingApplicant, "신청 메시지", NOW));
        Registration rejected = registrationCommandRepository.save(Registration.createPending(
                recruitment, rejectedApplicant, null, NOW.minusHours(1)));
        registrationCommandRepository.save(rejected.rejectBySystem("거절 사유", NOW));

        // When
        RegistrationListPage firstPage = repository.findPage(
                new RegistrationListSearchCriteria(recruitment.getId(), null, null, null),
                2
        );
        RegistrationListProjection cursorItem = firstPage.items().get(1);
        RegistrationListPage secondPage = repository.findPage(
                new RegistrationListSearchCriteria(
                        recruitment.getId(),
                        null,
                        cursorItem.registeredAt(),
                        cursorItem.id()
                ),
                2
        );
        RegistrationListPage approvedPage = repository.findPage(
                new RegistrationListSearchCriteria(
                        recruitment.getId(),
                        RegistrationStatus.APPROVED,
                        null,
                        null
                ),
                20
        );

        // Then
        assertThat(firstPage.items())
                .extracting(RegistrationListProjection::id)
                .containsExactly(pending.getId(), approved.getId());
        assertThat(firstPage.items().get(0).memberId()).isEqualTo(pendingApplicant.getId());
        assertThat(firstPage.items().get(0).message()).isEqualTo("신청 메시지");
        assertThat(firstPage.items().get(0).status()).isEqualTo(RegistrationStatus.PENDING);
        assertThat(firstPage.hasNext()).isTrue();
        assertThat(secondPage.items())
                .extracting(RegistrationListProjection::id)
                .containsExactly(rejected.getId());
        assertThat(secondPage.items().get(0).decisionReason()).isEqualTo("거절 사유");
        assertThat(secondPage.items().get(0).decidedByType()).isEqualTo(DecisionActorType.SYSTEM);
        assertThat(secondPage.items().get(0).decidedByMemberId()).isNull();
        assertThat(approvedPage.items())
                .extracting(RegistrationListProjection::id)
                .containsExactly(approved.getId());
        assertThat(approvedPage.items().get(0).decidedByMemberId()).isEqualTo(leader.getId());
    }

    private Member saveMember(String crewName, Course course, String githubId) {
        return memberRepository.save(Member.create(crewName, 8, githubId, course));
    }

    private Group saveGroup(String name) {
        return saveGroup(name, null);
    }

    private Group saveGroup(String name, String representativeImageKey) {
        return groupRepository.save(Group.createStudy(
                name,
                "함께 학습합니다.",
                null,
                representativeImageKey,
                RecurringGroupSchedule.of(
                        Set.of(DayOfWeek.MONDAY),
                        LocalTime.of(19, 0),
                        LocalTime.of(21, 0)
                ),
                NOW
        ));
    }

    @DisplayName("모집 공고의 그룹과 현재 모임장 권한을 조회한다.")
    @Test
    void findsRecruitmentGroupAndLeaderAccess() {
        // Given
        Member leader = saveMember("권한가온", Course.BACKEND, "registration-repository-access-leader");
        Member member = saveMember("권한마루", Course.FRONTEND, "registration-repository-access-member");
        Group group = saveGroup("신청자 권한 저장소 스터디");
        groupMemberRepository.save(GroupMember.createLeader(group, leader, NOW));
        groupMemberRepository.save(GroupMember.createMember(group, member, NOW));
        GroupRecruitment recruitment = recruitmentRepository.save(GroupRecruitment.create(
                group, JoinMethod.APPROVAL, 3, NOW.minusDays(1), NOW.plusDays(1)));

        // When / Then
        assertThat(repository.findGroupIdByRecruitmentId(recruitment.getId()))
                .contains(group.getId());
        assertThat(repository.existsLeaderByGroupIdAndMemberId(group.getId(), leader.getId()))
                .isTrue();
        assertThat(repository.existsLeaderByGroupIdAndMemberId(group.getId(), member.getId()))
                .isFalse();
    }

    @DisplayName("회원 ID와 상태를 기준으로 여러 모집 공고의 신청을 커서 조회한다.")
    @Test
    void findsMyRegistrationsWithMemberStatusAndCursor() {
        // Given
        Member applicant = saveMember("내신청자", Course.BACKEND, "my-registration-repository-applicant");
        Member otherApplicant = saveMember("타신청", Course.FRONTEND, "my-registration-repository-other");
        Group firstGroup = saveGroup(
                "my-registration-repository-group-1",
                "groups/my-registration-repository.webp"
        );
        Group secondGroup = saveGroup("my-registration-repository-group-2");
        GroupRecruitment firstRecruitment = saveRecruitment(firstGroup);
        GroupRecruitment secondRecruitment = saveRecruitment(secondGroup);
        Registration latest = savePending(firstRecruitment, applicant, NOW);
        Registration older = savePending(secondRecruitment, applicant, NOW.minusHours(1));
        savePending(firstRecruitment, otherApplicant, NOW.plusMinutes(1));

        // When
        MyRegistrationListPage firstPage = repository.findMyPage(
                new MyRegistrationListSearchCriteria(applicant.getId(), null, null, null),
                1
        );
        MyRegistrationListProjection cursorItem = firstPage.items().get(0);
        MyRegistrationListPage secondPage = repository.findMyPage(
                new MyRegistrationListSearchCriteria(
                        applicant.getId(),
                        RegistrationStatus.PENDING,
                        cursorItem.registeredAt(),
                        cursorItem.id()
                ),
                20
        );

        // Then
        assertThat(firstPage.items())
                .extracting(MyRegistrationListProjection::id)
                .containsExactly(latest.getId());
        assertThat(firstPage.items().get(0).groupId()).isEqualTo(firstGroup.getId());
        assertThat(firstPage.items().get(0).groupName()).isEqualTo("my-registration-repository-group-1");
        assertThat(firstPage.items().get(0).groupRepresentativeImageKey())
                .isEqualTo("groups/my-registration-repository.webp");
        assertThat(firstPage.items().get(0).recruitmentId()).isEqualTo(firstRecruitment.getId());
        assertThat(firstPage.hasNext()).isTrue();
        assertThat(secondPage.items())
                .extracting(MyRegistrationListProjection::id)
                .containsExactly(older.getId());
        assertThat(secondPage.items().get(0).groupId()).isEqualTo(secondGroup.getId());
        assertThat(secondPage.items().get(0).groupName()).isEqualTo("my-registration-repository-group-2");
    }

    @DisplayName("그룹의 모든 모집 공고에서 자동 승인까지 포함한 미확인 신청과 대기 신청을 조회한다.")
    @Test
    void findsUnreadSummaryByGroup() {
        // Given
        Member leader = saveMember("요약리더", Course.BACKEND, "registration-summary-repository-leader");
        Member latestApplicant = saveMember("요약가온", Course.BACKEND, "registration-summary-repository-latest");
        Member sameTimeApplicant = saveMember("요약나래", Course.FRONTEND, "registration-summary-repository-same-time");
        Member olderApplicant = saveMember("요약다온", Course.ANDROID, "registration-summary-repository-older");
        Member approvedApplicant = saveMember("요약라온", Course.BACKEND, "registration-summary-repository-approved");
        Member autoApplicant = saveMember("요약하람", Course.BACKEND, "registration-summary-repository-auto");
        Member otherApplicant = saveMember("요약마루", Course.FRONTEND, "registration-summary-repository-other");
        Group group = saveGroup("신청 요약 저장소 스터디");
        Group otherGroup = saveGroup("다른 신청 요약 저장소 스터디");
        groupMemberRepository.save(GroupMember.createLeader(group, leader, NOW));
        GroupRecruitment openRecruitment = saveRecruitment(group);
        GroupRecruitment closedRecruitment = recruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.APPROVAL,
                3,
                NOW.minusDays(5),
                NOW.plusDays(1)
        ));
        GroupRecruitment otherRecruitment = saveRecruitment(otherGroup);
        GroupRecruitment autoRecruitment = recruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.AUTO,
                3,
                NOW.minusDays(1),
                NOW.plusDays(1)
        ));
        savePending(openRecruitment, olderApplicant, NOW.minusHours(1));
        savePending(openRecruitment, sameTimeApplicant, NOW);
        Registration latest = savePending(closedRecruitment, latestApplicant, NOW);
        Registration approved = savePending(closedRecruitment, approvedApplicant, NOW.plusMinutes(1));
        registrationCommandRepository.save(approved.approve(DecisionActor.member(leader.getId()), NOW.plusMinutes(2), 0));
        Registration autoApproved = registrationCommandRepository.save(Registration.createAutoApproved(
                autoRecruitment,
                autoApplicant,
                null,
                NOW.plusMinutes(2),
                0
        ));
        recruitmentRepository.save(closedRecruitment.closeAt(NOW.plusMinutes(3)));
        savePending(otherRecruitment, otherApplicant, NOW.plusHours(3));

        // When
        RegistrationSummaryProjection summary = repository.findSummaryByGroupId(group.getId());

        // Then
        assertThat(summary.unreadCount()).isEqualTo(5);
        assertThat(summary.pendingCount()).isEqualTo(3);
        assertThat(summary.targetRecruitmentId()).isEqualTo(autoRecruitment.getId());
        assertThat(summary.latestRegistrationId()).isEqualTo(autoApproved.getId());
    }

    @DisplayName("그룹에 대기 신청이 없으면 대기 신청 수 0과 대상 모집 공고 없음으로 조회한다.")
    @Test
    void findsEmptyPendingSummaryByGroup() {
        // Given
        Group group = saveGroup("빈 신청 요약 저장소 스터디");
        saveRecruitment(group);

        // When
        RegistrationSummaryProjection summary = repository.findSummaryByGroupId(group.getId());

        // Then
        assertThat(summary.unreadCount()).isZero();
        assertThat(summary.pendingCount()).isZero();
        assertThat(summary.targetRecruitmentId()).isNull();
        assertThat(summary.latestRegistrationId()).isNull();
    }

    private Registration savePending(
            GroupRecruitment recruitment,
            Member applicant,
            LocalDateTime registeredAt
    ) {
        return registrationCommandRepository.save(Registration.createPending(
                recruitment,
                applicant,
                null,
                registeredAt
        ));
    }

    private GroupRecruitment saveRecruitment(Group group) {
        return recruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.APPROVAL,
                3,
                NOW.minusDays(1),
                NOW.plusDays(1)
        ));
    }
}
