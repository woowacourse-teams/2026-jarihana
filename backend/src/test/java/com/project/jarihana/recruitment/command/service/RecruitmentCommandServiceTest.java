package com.project.jarihana.recruitment.command.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.command.repository.GroupRecruitmentCommandRepository;
import com.project.jarihana.recruitment.command.service.dto.CreateRecruitmentCommand;
import com.project.jarihana.recruitment.command.service.dto.CreateRecruitmentResult;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.recruitment.domain.RecruitmentPhase;
import com.project.jarihana.registration.command.repository.RegistrationCommandRepository;
import com.project.jarihana.registration.domain.DecisionActorType;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.RegistrationStatus;
import com.project.jarihana.registration.query.repository.RegistrationListJpaRepository;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class RecruitmentCommandServiceTest extends IntegrationTestSupport {

    @Autowired
    private RecruitmentCommandService recruitmentCommandService;

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private GroupMemberJpaRepository groupMemberRepository;

    @Autowired
    private GroupRecruitmentCommandRepository recruitmentRepository;

    @Autowired
    private RegistrationCommandRepository registrationRepository;

    @Autowired
    private RegistrationListJpaRepository registrationListRepository;

    @Autowired
    private MemberRepository memberRepository;

    @DisplayName("새 모집 공고를 등록하면 기존 활성 공고를 현재 시각에 마감하고 대기 신청을 시스템 거절한다.")
    @Test
    void createsRecruitmentAndClosesPreviousRecruitment() {
        // Given
        Member leaderMember = saveMember("가람", "create-recruitment-leader");
        Member applicant = saveMember("나래", "create-recruitment-applicant");
        Group group = groupRepository.save(Group.createClub(
                "새 모집 공고 그룹",
                "함께 활동해요",
                null,
                null,
                null,
                TestSupportConfig.FIXED_NOW.minusDays(10)
        ));
        groupMemberRepository.save(GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        GroupRecruitment previousRecruitment = recruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.APPROVAL,
                3,
                TestSupportConfig.FIXED_NOW.minusDays(2),
                TestSupportConfig.FIXED_NOW.plusDays(2)
        ));
        Registration pendingRegistration = registrationRepository.save(Registration.createPending(
                previousRecruitment,
                applicant,
                "가입하고 싶습니다.",
                TestSupportConfig.FIXED_NOW.minusDays(1)
        ));
        LocalDateTime startsAt = TestSupportConfig.FIXED_NOW.plusDays(1);
        LocalDateTime endsAt = TestSupportConfig.FIXED_NOW.plusDays(10);

        // When
        CreateRecruitmentResult result = recruitmentCommandService.createRecruitment(
                leaderMember.getId(),
                group.getId(),
                new CreateRecruitmentCommand(JoinMethod.AUTO, 5, startsAt, endsAt)
        );

        // Then
        assertThat(result.groupId()).isEqualTo(group.getId());
        assertThat(result.joinMethod()).isEqualTo(JoinMethod.AUTO);
        assertThat(result.capacity()).isEqualTo(5);
        assertThat(result.startsAt()).isEqualTo(startsAt);
        assertThat(result.endsAt()).isEqualTo(endsAt);
        assertThat(result.phase()).isEqualTo(RecruitmentPhase.UPCOMING);
        assertThat(recruitmentRepository.findAllByGroupId(group.getId()))
                .filteredOn(recruitment -> recruitment.getId().equals(previousRecruitment.getId()))
                .singleElement()
                .extracting(GroupRecruitment::getEndsAt)
                .isEqualTo(TestSupportConfig.FIXED_NOW);
        assertThat(registrationListRepository.findById(pendingRegistration.getId()).orElseThrow())
                .satisfies(registration -> {
                    assertThat(registration.getStatus()).isEqualTo(RegistrationStatus.REJECTED);
                    assertThat(registration.getDecidedAt()).isEqualTo(TestSupportConfig.FIXED_NOW);
                    assertThat(registration.getDecidedBy().getType()).isEqualTo(DecisionActorType.SYSTEM);
                });
    }

    @DisplayName("이미 기간이 만료된 공고의 대기 신청은 새 공고 등록 시 거절하지 않는다.")
    @Test
    void keepsPendingRegistrationOfExpiredRecruitment() {
        // Given
        Member leaderMember = saveMember("다솜", "create-recruitment-expired-leader");
        Member applicant = saveMember("라온", "create-recruitment-expired-applicant");
        Group group = saveActiveGroup("만료 공고 유지 그룹");
        groupMemberRepository.save(GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        GroupRecruitment expiredRecruitment = recruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.APPROVAL,
                3,
                TestSupportConfig.FIXED_NOW.minusDays(4),
                TestSupportConfig.FIXED_NOW.minusDays(2)
        ));
        Registration pendingRegistration = registrationRepository.save(Registration.createPending(
                expiredRecruitment,
                applicant,
                null,
                TestSupportConfig.FIXED_NOW.minusDays(3)
        ));

        // When
        recruitmentCommandService.createRecruitment(
                leaderMember.getId(),
                group.getId(),
                command(JoinMethod.APPROVAL)
        );

        // Then
        assertThat(registrationListRepository.findById(pendingRegistration.getId()).orElseThrow().getStatus())
                .isEqualTo(RegistrationStatus.PENDING);
    }

    @DisplayName("현재 모임장이 아닌 구성원은 새 모집 공고를 등록할 수 없다.")
    @Test
    void rejectsRecruitmentCreationFromNonLeader() {
        // Given
        Member leaderMember = saveMember("마루", "create-recruitment-owner");
        Member requesterMember = saveMember("보라", "create-recruitment-non-leader");
        Group group = saveActiveGroup("비리더 공고 등록 그룹");
        groupMemberRepository.save(GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        groupMemberRepository.save(GroupMember.createMember(group, requesterMember, TestSupportConfig.FIXED_NOW));

        // When / Then
        assertThatThrownBy(() -> recruitmentCommandService.createRecruitment(
                requesterMember.getId(),
                group.getId(),
                command(JoinMethod.APPROVAL)
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_ACCESS_DENIED);
    }

    @DisplayName("종료된 그룹에는 새 모집 공고를 등록할 수 없다.")
    @Test
    void rejectsRecruitmentCreationForEndedGroup() {
        // Given
        Member leaderMember = saveMember("새봄", "create-recruitment-ended-leader");
        Group group = saveActiveGroup("종료된 공고 등록 그룹");
        groupMemberRepository.save(GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        groupRepository.save(group.endAt(TestSupportConfig.FIXED_NOW.plusDays(2)));

        // When / Then
        assertThatThrownBy(() -> recruitmentCommandService.createRecruitment(
                leaderMember.getId(),
                group.getId(),
                command(JoinMethod.APPROVAL)
        )).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_ENDED);
    }

    @DisplayName("동시에 새 모집 공고를 등록해도 미마감 공고는 하나만 남는다.")
    @Test
    void serializesConcurrentRecruitmentCreation() throws Exception {
        // Given
        Member leaderMember = saveMember("아라", "create-recruitment-concurrent-leader");
        Group group = saveActiveGroup("동시 공고 등록 그룹");
        groupMemberRepository.save(GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            Future<CreateRecruitmentResult> first = executor.submit(() -> createWhenReleased(
                    start,
                    leaderMember.getId(),
                    group.getId(),
                    JoinMethod.AUTO
            ));
            Future<CreateRecruitmentResult> second = executor.submit(() -> createWhenReleased(
                    start,
                    leaderMember.getId(),
                    group.getId(),
                    JoinMethod.APPROVAL
            ));

            // When
            start.countDown();
            List<CreateRecruitmentResult> results = List.of(
                    first.get(5, TimeUnit.SECONDS),
                    second.get(5, TimeUnit.SECONDS)
            );

            // Then
            assertThat(results).hasSize(2);
            assertThat(recruitmentRepository.findActiveByGroupId(group.getId(), TestSupportConfig.FIXED_NOW))
                    .hasSize(1);
        } finally {
            executor.shutdownNow();
        }
    }

    private CreateRecruitmentResult createWhenReleased(
            CountDownLatch start,
            long memberId,
            long groupId,
            JoinMethod joinMethod
    ) {
        try {
            if (!start.await(3, TimeUnit.SECONDS)) {
                throw new IllegalStateException("동시 모집 공고 등록 시작 대기 시간이 초과되었습니다.");
            }
            return recruitmentCommandService.createRecruitment(memberId, groupId, command(joinMethod));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("동시 모집 공고 등록 테스트가 중단되었습니다.", exception);
        }
    }

    private CreateRecruitmentCommand command(JoinMethod joinMethod) {
        return new CreateRecruitmentCommand(
                joinMethod,
                5,
                TestSupportConfig.FIXED_NOW,
                TestSupportConfig.FIXED_NOW.plusDays(7)
        );
    }

    private Group saveActiveGroup(String name) {
        return groupRepository.save(Group.createClub(
                name,
                "함께 활동해요",
                null,
                null,
                null,
                TestSupportConfig.FIXED_NOW.minusDays(10)
        ));
    }

    private Member saveMember(String crewName, String githubId) {
        return memberRepository.save(Member.create(crewName, 8, githubId, Course.BACKEND));
    }
}
