package com.project.jarihana.registration.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.command.repository.GroupRecruitmentCommandRepository;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.registration.command.repository.RegistrationCommandRepository;
import com.project.jarihana.registration.command.service.dto.CreateRegistrationCommand;
import com.project.jarihana.registration.command.service.dto.CreateRegistrationResult;
import com.project.jarihana.registration.command.service.dto.DecideRegistrationCommand;
import com.project.jarihana.registration.command.service.dto.DecideRegistrationResult;
import com.project.jarihana.registration.command.service.dto.RegistrationDecision;
import com.project.jarihana.registration.domain.DecisionActor;
import com.project.jarihana.registration.domain.DecisionActorType;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.RegistrationStatus;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RegistrationCommandServiceTest extends IntegrationTestSupport {

    @Autowired
    private RegistrationCommandService registrationCommandService;

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private GroupMemberCommandRepository groupMemberRepository;

    @Autowired
    private GroupMemberJpaRepository groupMemberJpaRepository;

    @Autowired
    private GroupRecruitmentCommandRepository recruitmentRepository;

    @Autowired
    private RegistrationCommandRepository registrationRepository;

    @Autowired
    private MemberRepository memberRepository;

    @DisplayName("신청자가 자신의 대기 신청을 철회하면 신청을 삭제한다.")
    @Test
    void withdrawsOwnPendingRegistration() {
        // Given
        Member applicant = saveMember("가온", "registration-service-withdrawal-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 2);
        Registration registration = savePendingRegistration(recruitment, applicant);

        // When
        registrationCommandService.withdrawRegistration(
                applicant.getId(),
                recruitment.getId(),
                registration.getId()
        );

        // Then
        assertThat(registrationRepository.existsByRecruitmentIdAndMemberId(
                recruitment.getId(),
                applicant.getId()
        )).isFalse();
    }

    private Registration savePendingRegistration(GroupRecruitment recruitment, Member applicant) {
        return registrationRepository.save(Registration.createPending(
                recruitment,
                applicant,
                null,
                TestSupportConfig.FIXED_NOW.minusHours(1)
        ));
    }

    private GroupRecruitment saveRecruitment(JoinMethod joinMethod, int capacity) {
        return saveRecruitment(
                saveActiveGroup("가입 신청 서비스 그룹 " + joinMethod + " " + capacity),
                joinMethod,
                capacity,
                TestSupportConfig.FIXED_NOW.minusDays(1),
                TestSupportConfig.FIXED_NOW.plusDays(7)
        );
    }

    private GroupRecruitment saveRecruitment(
            Group group,
            JoinMethod joinMethod,
            int capacity,
            LocalDateTime startsAt,
            LocalDateTime endsAt
    ) {
        return recruitmentRepository.save(GroupRecruitment.create(
                group,
                joinMethod,
                capacity,
                startsAt,
                endsAt
        ));
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

    @DisplayName("다른 회원의 가입 신청은 철회할 수 없다.")
    @Test
    void rejectsWithdrawalOfAnotherMembersRegistration() {
        // Given
        Member applicant = saveMember("가람", "registration-service-withdrawal-owner");
        Member requester = saveMember("나래", "registration-service-withdrawal-requester");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 2);
        Registration registration = savePendingRegistration(recruitment, applicant);

        // When / Then
        assertBusinessError(
                () -> registrationCommandService.withdrawRegistration(
                        requester.getId(),
                        recruitment.getId(),
                        registration.getId()
                ),
                ErrorCode.REGISTRATION_ACCESS_DENIED
        );
        assertThat(registrationRepository.existsByRecruitmentIdAndMemberId(
                recruitment.getId(),
                applicant.getId()
        )).isTrue();
    }

    private void assertBusinessError(Runnable action, ErrorCode errorCode) {
        assertThatThrownBy(action::run)
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(errorCode);
    }

    @DisplayName("가입 신청이 요청한 모집 공고에 속하지 않으면 철회할 신청을 찾을 수 없다.")
    @Test
    void rejectsWithdrawalForRegistrationFromAnotherRecruitment() {
        // Given
        Member applicant = saveMember("라온", "withdrawal-another-recruitment-applicant");
        GroupRecruitment requestedRecruitment = saveRecruitment(JoinMethod.APPROVAL, 2);
        GroupRecruitment anotherRecruitment = saveRecruitment(JoinMethod.APPROVAL, 3);
        Registration registration = savePendingRegistration(anotherRecruitment, applicant);

        // When / Then
        assertBusinessError(
                () -> registrationCommandService.withdrawRegistration(
                        applicant.getId(),
                        requestedRecruitment.getId(),
                        registration.getId()
                ),
                ErrorCode.REGISTRATION_NOT_FOUND
        );
    }

    @DisplayName("승인되거나 거절된 가입 신청은 철회할 수 없다.")
    @ParameterizedTest
    @EnumSource(value = RegistrationStatus.class, names = {"APPROVED", "REJECTED"})
    void rejectsWithdrawalOfDecidedRegistration(RegistrationStatus status) {
        // Given
        Member applicant = saveMember("누리", "withdrawal-applicant-" + status);
        Member decider = saveMember("다온", "withdrawal-decider-" + status);
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 2);
        Registration pendingRegistration = Registration.createPending(
                recruitment,
                applicant,
                null,
                TestSupportConfig.FIXED_NOW.minusHours(1)
        );
        Registration decidedRegistration = registrationRepository.save(switch (status) {
            case APPROVED -> pendingRegistration.approve(
                    DecisionActor.member(decider.getId()),
                    TestSupportConfig.FIXED_NOW,
                    0
            );
            case REJECTED -> pendingRegistration.reject(
                    DecisionActor.member(decider.getId()),
                    "모집 방향과 맞지 않습니다.",
                    TestSupportConfig.FIXED_NOW
            );
            case PENDING -> throw new IllegalArgumentException("결정되지 않은 상태입니다.");
        });

        // When / Then
        assertBusinessError(
                () -> registrationCommandService.withdrawRegistration(
                        applicant.getId(),
                        recruitment.getId(),
                        decidedRegistration.getId()
                ),
                ErrorCode.REGISTRATION_ALREADY_DECIDED
        );
        assertThat(registrationRepository.existsByRecruitmentIdAndMemberId(
                recruitment.getId(),
                applicant.getId()
        )).isTrue();
    }

    @DisplayName("모임장이 대기 신청을 승인하면 신청을 승인하고 신청자를 구성원으로 등록한다.")
    @Test
    void approvesPendingRegistration() {
        // Given
        Member leader = saveMember("가온", "registration-service-decision-leader");
        Member applicant = saveMember("가람", "registration-service-decision-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 2);
        groupMemberRepository.save(GroupMember.createLeader(
                recruitment.getGroup(),
                leader,
                TestSupportConfig.FIXED_NOW.minusDays(1)
        ));
        Registration registration = registrationRepository.save(Registration.createPending(
                recruitment,
                applicant,
                "함께하고 싶습니다.",
                TestSupportConfig.FIXED_NOW.minusHours(1)
        ));

        // When
        DecideRegistrationResult result = registrationCommandService.decideRegistration(
                leader.getId(),
                recruitment.getId(),
                registration.getId(),
                new DecideRegistrationCommand(RegistrationDecision.APPROVED, null)
        );

        // Then
        assertThat(result.id()).isEqualTo(registration.getId());
        assertThat(result.status()).isEqualTo(RegistrationStatus.APPROVED);
        assertThat(result.decisionReason()).isNull();
        assertThat(result.decidedAt()).isEqualTo(TestSupportConfig.FIXED_NOW);
        assertThat(result.decidedByType()).isEqualTo(DecisionActorType.MEMBER);
        assertThat(result.decidedByMemberId()).isEqualTo(leader.getId());
        assertThat(groupMemberRepository.findByGroupIdAndMemberId(
                recruitment.getGroup().getId(),
                applicant.getId()
        )).isPresent();
    }

    @DisplayName("모임장이 대기 신청을 거절하면 사유와 결정 주체를 기록하고 구성원을 만들지 않는다.")
    @Test
    void rejectsPendingRegistration() {
        // Given
        Member leader = saveMember("나래", "registration-service-rejection-leader");
        Member applicant = saveMember("누리", "registration-service-rejection-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 2);
        groupMemberRepository.save(GroupMember.createLeader(
                recruitment.getGroup(),
                leader,
                TestSupportConfig.FIXED_NOW.minusDays(1)
        ));
        Registration registration = registrationRepository.save(Registration.createPending(
                recruitment,
                applicant,
                null,
                TestSupportConfig.FIXED_NOW.minusHours(1)
        ));

        // When
        DecideRegistrationResult result = registrationCommandService.decideRegistration(
                leader.getId(),
                recruitment.getId(),
                registration.getId(),
                new DecideRegistrationCommand(RegistrationDecision.REJECTED, "모집 방향과 맞지 않습니다.")
        );

        // Then
        assertThat(result.status()).isEqualTo(RegistrationStatus.REJECTED);
        assertThat(result.decisionReason()).isEqualTo("모집 방향과 맞지 않습니다.");
        assertThat(result.decidedAt()).isEqualTo(TestSupportConfig.FIXED_NOW);
        assertThat(result.decidedByType()).isEqualTo(DecisionActorType.MEMBER);
        assertThat(result.decidedByMemberId()).isEqualTo(leader.getId());
        assertThat(groupMemberRepository.findByGroupIdAndMemberId(
                recruitment.getGroup().getId(),
                applicant.getId()
        )).isEmpty();
    }

    @DisplayName("승인으로 정원이 차면 모집을 현재 시각에 마감하고 나머지 대기 신청을 시스템 거절한다.")
    @Test
    void closesRecruitmentAndRejectsPendingRegistrationsWhenCapacityIsReached() {
        // Given
        Member leader = saveMember("다온", "registration-service-full-decision-leader");
        Member approvedApplicant = saveMember("라온", "registration-service-full-approved-applicant");
        Member pendingApplicant = saveMember("마루", "registration-service-full-pending-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 1);
        groupMemberRepository.save(GroupMember.createLeader(
                recruitment.getGroup(),
                leader,
                TestSupportConfig.FIXED_NOW.minusDays(1)
        ));
        Registration approvedTarget = registrationRepository.save(Registration.createPending(
                recruitment,
                approvedApplicant,
                null,
                TestSupportConfig.FIXED_NOW.minusHours(2)
        ));
        registrationRepository.save(Registration.createPending(
                recruitment,
                pendingApplicant,
                null,
                TestSupportConfig.FIXED_NOW.minusHours(1)
        ));

        // When
        registrationCommandService.decideRegistration(
                leader.getId(),
                recruitment.getId(),
                approvedTarget.getId(),
                new DecideRegistrationCommand(RegistrationDecision.APPROVED, null)
        );

        // Then
        assertThat(recruitmentRepository.findAllByGroupId(recruitment.getGroup().getId()))
                .singleElement()
                .extracting(GroupRecruitment::getEndsAt)
                .isEqualTo(TestSupportConfig.FIXED_NOW);
        assertThat(registrationRepository.countByRecruitmentIdAndStatus(
                recruitment.getId(),
                RegistrationStatus.APPROVED
        )).isEqualTo(1);
        assertThat(registrationRepository.countByRecruitmentIdAndStatus(
                recruitment.getId(),
                RegistrationStatus.PENDING
        )).isZero();
        assertThat(registrationRepository.countByRecruitmentIdAndStatus(
                recruitment.getId(),
                RegistrationStatus.REJECTED
        )).isEqualTo(1);
    }

    @DisplayName("이미 수동 마감된 모집도 대기 신청을 승인할 수 있고 정원 도달 시 기존 마감 시각을 유지한다.")
    @Test
    void preservesClosedRecruitmentEndTimeWhenApprovalReachesCapacity() {
        // Given
        Member leader = saveMember("보라", "registration-service-closed-decision-leader");
        Member approvedApplicant = saveMember("새봄", "registration-service-closed-approved-applicant");
        Member pendingApplicant = saveMember("아라", "registration-service-closed-pending-applicant");
        LocalDateTime closedAt = TestSupportConfig.FIXED_NOW.minusHours(1);
        GroupRecruitment recruitment = saveRecruitment(
                JoinMethod.APPROVAL,
                1,
                TestSupportConfig.FIXED_NOW.minusDays(2),
                closedAt
        );
        groupMemberRepository.save(GroupMember.createLeader(
                recruitment.getGroup(),
                leader,
                TestSupportConfig.FIXED_NOW.minusDays(1)
        ));
        Registration approvedTarget = registrationRepository.save(Registration.createPending(
                recruitment,
                approvedApplicant,
                null,
                closedAt.minusHours(2)
        ));
        registrationRepository.save(Registration.createPending(
                recruitment,
                pendingApplicant,
                null,
                closedAt.minusHours(1)
        ));

        // When
        registrationCommandService.decideRegistration(
                leader.getId(),
                recruitment.getId(),
                approvedTarget.getId(),
                new DecideRegistrationCommand(RegistrationDecision.APPROVED, null)
        );

        // Then
        assertThat(recruitmentRepository.findAllByGroupId(recruitment.getGroup().getId()))
                .singleElement()
                .extracting(GroupRecruitment::getEndsAt)
                .isEqualTo(closedAt);
        assertThat(registrationRepository.countByRecruitmentIdAndStatus(
                recruitment.getId(),
                RegistrationStatus.REJECTED
        )).isEqualTo(1);
    }

    private GroupRecruitment saveRecruitment(
            JoinMethod joinMethod,
            int capacity,
            LocalDateTime startsAt,
            LocalDateTime endsAt
    ) {
        return saveRecruitment(
                saveActiveGroup("가입 신청 기간 검증 그룹 " + startsAt),
                joinMethod,
                capacity,
                startsAt,
                endsAt
        );
    }

    @DisplayName("해당 그룹의 모임장이 아니면 가입 신청을 처리할 수 없다.")
    @Test
    void rejectsDecisionByNonLeader() {
        // Given
        Member leader = saveMember("윤슬", "registration-service-access-leader");
        Member requester = saveMember("이든", "registration-service-access-requester");
        Member applicant = saveMember("하람", "registration-service-access-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 2);
        saveLeader(recruitment, leader);
        Registration registration = savePendingRegistration(recruitment, applicant);

        // When / Then
        assertBusinessError(
                () -> decideRegistration(requester, recruitment, registration, RegistrationDecision.APPROVED),
                ErrorCode.REGISTRATION_ACCESS_DENIED
        );
    }

    private DecideRegistrationResult decideRegistration(
            Member member,
            GroupRecruitment recruitment,
            Registration registration,
            RegistrationDecision decision
    ) {
        return registrationCommandService.decideRegistration(
                member.getId(),
                recruitment.getId(),
                registration.getId(),
                new DecideRegistrationCommand(decision, null)
        );
    }

    private GroupMember saveLeader(GroupRecruitment recruitment, Member leader) {
        return groupMemberRepository.save(GroupMember.createLeader(
                recruitment.getGroup(),
                leader,
                TestSupportConfig.FIXED_NOW.minusDays(1)
        ));
    }

    @DisplayName("가입 신청이 요청한 모집 공고에 속하지 않으면 찾을 수 없는 신청으로 처리한다.")
    @Test
    void rejectsDecisionForRegistrationFromAnotherRecruitment() {
        // Given
        Member leader = saveMember("해솔", "registration-service-not-found-leader");
        Member applicant = saveMember("한결", "registration-service-not-found-applicant");
        GroupRecruitment requestedRecruitment = saveRecruitment(
                saveActiveGroup("가입 신청 판정 대상 그룹"),
                JoinMethod.APPROVAL,
                2,
                TestSupportConfig.FIXED_NOW.minusDays(1),
                TestSupportConfig.FIXED_NOW.plusDays(7)
        );
        GroupRecruitment anotherRecruitment = saveRecruitment(
                saveActiveGroup("가입 신청 판정 다른 그룹"),
                JoinMethod.APPROVAL,
                2,
                TestSupportConfig.FIXED_NOW.minusDays(1),
                TestSupportConfig.FIXED_NOW.plusDays(7)
        );
        saveLeader(requestedRecruitment, leader);
        Registration registration = savePendingRegistration(anotherRecruitment, applicant);

        // When / Then
        assertBusinessError(
                () -> decideRegistration(leader, requestedRecruitment, registration, RegistrationDecision.APPROVED),
                ErrorCode.REGISTRATION_NOT_FOUND
        );
    }

    @DisplayName("이미 처리된 가입 신청은 다시 승인하거나 거절할 수 없다.")
    @Test
    void rejectsAlreadyDecidedRegistration() {
        // Given
        Member leader = saveMember("가람", "registration-service-decided-leader");
        Member applicant = saveMember("가온", "registration-service-decided-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 2);
        saveLeader(recruitment, leader);
        Registration registration = savePendingRegistration(recruitment, applicant);
        decideRegistration(leader, recruitment, registration, RegistrationDecision.APPROVED);

        // When / Then
        assertBusinessError(
                () -> decideRegistration(leader, recruitment, registration, RegistrationDecision.REJECTED),
                ErrorCode.REGISTRATION_ALREADY_DECIDED
        );
    }

    @DisplayName("승인된 인원이 정원에 도달했으면 대기 신청을 승인할 수 없다.")
    @Test
    void rejectsApprovalWhenCapacityIsFull() {
        // Given
        Member leader = saveMember("나래", "registration-service-capacity-leader");
        Member approvedMember = saveMember("누리", "registration-service-capacity-approved-member");
        Member applicant = saveMember("다온", "registration-service-capacity-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 1);
        saveLeader(recruitment, leader);
        Registration approvedRegistration = Registration.createPending(
                        recruitment,
                        approvedMember,
                        null,
                        TestSupportConfig.FIXED_NOW.minusHours(2)
                )
                .approve(
                        DecisionActor.member(leader.getId()),
                        TestSupportConfig.FIXED_NOW.minusHours(1),
                        0
                );
        registrationRepository.save(approvedRegistration);
        groupMemberRepository.save(GroupMember.createMember(
                recruitment.getGroup(),
                approvedMember,
                TestSupportConfig.FIXED_NOW.minusHours(1)
        ));
        Registration registration = savePendingRegistration(recruitment, applicant);

        // When / Then
        assertBusinessError(
                () -> decideRegistration(leader, recruitment, registration, RegistrationDecision.APPROVED),
                ErrorCode.RECRUITMENT_CAPACITY_EXCEEDED
        );
    }

    @DisplayName("신청자가 이미 그룹 구성원이면 가입 신청을 승인할 수 없다.")
    @Test
    void rejectsApprovalForExistingGroupMember() {
        // Given
        Member leader = saveMember("라온", "registration-service-existing-leader");
        Member applicant = saveMember("마루", "registration-service-existing-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 2);
        saveLeader(recruitment, leader);
        Registration registration = savePendingRegistration(recruitment, applicant);
        groupMemberRepository.save(GroupMember.createMember(
                recruitment.getGroup(),
                applicant,
                TestSupportConfig.FIXED_NOW.minusMinutes(30)
        ));

        // When / Then
        assertBusinessError(
                () -> decideRegistration(leader, recruitment, registration, RegistrationDecision.APPROVED),
                ErrorCode.GROUP_MEMBER_ALREADY_EXISTS
        );
    }

    @DisplayName("종료된 그룹의 가입 신청은 승인하거나 거절할 수 없다.")
    @Test
    void rejectsDecisionForEndedGroup() {
        // Given
        Member leader = saveMember("보라", "registration-service-ended-decision-leader");
        Member applicant = saveMember("새봄", "registration-service-ended-decision-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 2);
        saveLeader(recruitment, leader);
        Registration registration = savePendingRegistration(recruitment, applicant);
        groupRepository.save(recruitment.getGroup().endAt(TestSupportConfig.FIXED_NOW.plusDays(2)));

        // When / Then
        assertBusinessError(
                () -> decideRegistration(leader, recruitment, registration, RegistrationDecision.REJECTED),
                ErrorCode.GROUP_ENDED
        );
    }

    @DisplayName("정원이 1명인 승인제 모집의 대기 신청을 동시에 승인해도 한 명만 승인한다.")
    @Test
    void serializesConcurrentRegistrationApprovals() throws Exception {
        // Given
        Member leader = saveMember("아라", "registration-service-concurrent-decision-leader");
        Member firstApplicant = saveMember("윤슬", "registration-service-concurrent-decision-first");
        Member secondApplicant = saveMember("이든", "registration-service-concurrent-decision-second");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 1);
        saveLeader(recruitment, leader);
        Registration firstRegistration = savePendingRegistration(recruitment, firstApplicant);
        Registration secondRegistration = savePendingRegistration(recruitment, secondApplicant);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            Future<DecisionAttempt> first = executor.submit(
                    () -> decideWhenReleased(start, leader.getId(), recruitment.getId(), firstRegistration.getId())
            );
            Future<DecisionAttempt> second = executor.submit(
                    () -> decideWhenReleased(start, leader.getId(), recruitment.getId(), secondRegistration.getId())
            );

            // When
            start.countDown();
            List<DecisionAttempt> attempts = List.of(
                    first.get(5, TimeUnit.SECONDS),
                    second.get(5, TimeUnit.SECONDS)
            );

            // Then
            assertThat(attempts).filteredOn(DecisionAttempt::succeeded).hasSize(1);
            assertThat(attempts)
                    .filteredOn(attempt -> attempt.errorCode() == ErrorCode.REGISTRATION_ALREADY_DECIDED)
                    .hasSize(1);
            assertThat(registrationRepository.countByRecruitmentIdAndStatus(
                    recruitment.getId(),
                    RegistrationStatus.APPROVED
            )).isEqualTo(1);
            assertThat(registrationRepository.countByRecruitmentIdAndStatus(
                    recruitment.getId(),
                    RegistrationStatus.REJECTED
            )).isEqualTo(1);
            assertThat(groupMemberJpaRepository.findAllByGroupIdInOrderById(
                    List.of(recruitment.getGroup().getId())
            )).hasSize(2);
        } finally {
            executor.shutdownNow();
        }
    }

    private DecisionAttempt decideWhenReleased(
            CountDownLatch start,
            long memberId,
            long recruitmentId,
            long registrationId
    ) {
        try {
            if (!start.await(3, TimeUnit.SECONDS)) {
                throw new IllegalStateException("동시 가입 신청 처리 시작 대기 시간이 초과되었습니다.");
            }
            registrationCommandService.decideRegistration(
                    memberId,
                    recruitmentId,
                    registrationId,
                    new DecideRegistrationCommand(RegistrationDecision.APPROVED, null)
            );
            return DecisionAttempt.success();
        } catch (BusinessException exception) {
            return DecisionAttempt.failure(exception.getErrorCode());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("동시 가입 신청 처리 테스트가 중단되었습니다.", exception);
        }
    }

    @DisplayName("같은 대기 신청을 승인하고 철회해도 둘 중 하나만 반영한다.")
    @Test
    void serializesConcurrentDecisionAndWithdrawal() throws Exception {
        // Given
        Member leader = saveMember("윤슬", "withdrawal-race-leader");
        Member applicant = saveMember("이든", "withdrawal-race-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 2);
        saveLeader(recruitment, leader);
        Registration registration = savePendingRegistration(recruitment, applicant);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            Future<DecisionAttempt> decision = executor.submit(
                    () -> decideWhenReleased(start, leader.getId(), recruitment.getId(), registration.getId())
            );
            Future<WithdrawalAttempt> withdrawal = executor.submit(
                    () -> withdrawWhenReleased(start, applicant.getId(), recruitment.getId(), registration.getId())
            );

            // When
            start.countDown();
            DecisionAttempt decisionAttempt = decision.get(5, TimeUnit.SECONDS);
            WithdrawalAttempt withdrawalAttempt = withdrawal.get(5, TimeUnit.SECONDS);

            // Then
            assertThat(decisionAttempt.succeeded()).isNotEqualTo(withdrawalAttempt.succeeded());
            if (decisionAttempt.succeeded()) {
                assertThat(withdrawalAttempt.errorCode()).isEqualTo(ErrorCode.REGISTRATION_ALREADY_DECIDED);
                assertThat(registrationRepository.countByRecruitmentIdAndStatus(
                        recruitment.getId(),
                        RegistrationStatus.APPROVED
                )).isEqualTo(1);
                assertThat(groupMemberRepository.findByGroupIdAndMemberId(
                        recruitment.getGroup().getId(),
                        applicant.getId()
                )).isPresent();
                return;
            }
            assertThat(decisionAttempt.errorCode()).isEqualTo(ErrorCode.REGISTRATION_NOT_FOUND);
            assertThat(registrationRepository.existsByRecruitmentIdAndMemberId(
                    recruitment.getId(),
                    applicant.getId()
            )).isFalse();
            assertThat(groupMemberRepository.findByGroupIdAndMemberId(
                    recruitment.getGroup().getId(),
                    applicant.getId()
            )).isEmpty();
        } finally {
            executor.shutdownNow();
        }
    }

    private WithdrawalAttempt withdrawWhenReleased(
            CountDownLatch start,
            long memberId,
            long recruitmentId,
            long registrationId
    ) {
        try {
            if (!start.await(3, TimeUnit.SECONDS)) {
                throw new IllegalStateException("동시 가입 신청 철회 시작 대기 시간이 초과되었습니다.");
            }
            registrationCommandService.withdrawRegistration(memberId, recruitmentId, registrationId);
            return WithdrawalAttempt.success();
        } catch (BusinessException exception) {
            return WithdrawalAttempt.failure(exception.getErrorCode());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("동시 가입 신청 철회 테스트가 중단되었습니다.", exception);
        }
    }

    @DisplayName("종료된 그룹의 모집 공고에는 가입 신청할 수 없다.")
    @Test
    void rejectsRegistrationForEndedGroup() {
        // Given
        Member applicant = saveMember("다온", "registration-service-ended-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 3);
        groupRepository.save(recruitment.getGroup().endAt(TestSupportConfig.FIXED_NOW.plusDays(2)));

        // When / Then
        assertBusinessError(
                () -> createRegistration(applicant, recruitment),
                ErrorCode.GROUP_ENDED
        );
    }

    private CreateRegistrationResult createRegistration(Member member, GroupRecruitment recruitment) {
        return registrationCommandService.createRegistration(
                member.getId(),
                recruitment.getId(),
                new CreateRegistrationCommand("함께하고 싶습니다.")
        );
    }

    @DisplayName("모집 시작 전에는 가입 신청할 수 없다.")
    @Test
    void rejectsRegistrationBeforeRecruitmentStarts() {
        // Given
        Member applicant = saveMember("라온", "registration-service-upcoming-applicant");
        GroupRecruitment recruitment = saveRecruitment(
                JoinMethod.APPROVAL,
                3,
                TestSupportConfig.FIXED_NOW.plusDays(1),
                TestSupportConfig.FIXED_NOW.plusDays(7)
        );

        // When / Then
        assertBusinessError(
                () -> createRegistration(applicant, recruitment),
                ErrorCode.RECRUITMENT_NOT_OPEN
        );
    }

    @DisplayName("마감된 모집 공고에는 가입 신청할 수 없다.")
    @Test
    void rejectsRegistrationAfterRecruitmentEnds() {
        // Given
        Member applicant = saveMember("마루", "registration-service-closed-applicant");
        GroupRecruitment recruitment = saveRecruitment(
                JoinMethod.APPROVAL,
                3,
                TestSupportConfig.FIXED_NOW.minusDays(7),
                TestSupportConfig.FIXED_NOW.minusDays(1)
        );

        // When / Then
        assertBusinessError(
                () -> createRegistration(applicant, recruitment),
                ErrorCode.RECRUITMENT_NOT_OPEN
        );
    }

    @DisplayName("이미 그룹 구성원인 회원은 가입 신청할 수 없다.")
    @Test
    void rejectsRegistrationFromExistingGroupMember() {
        // Given
        Member applicant = saveMember("보라", "registration-service-member-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 3);
        groupMemberRepository.save(GroupMember.createMember(
                recruitment.getGroup(),
                applicant,
                TestSupportConfig.FIXED_NOW.minusDays(1)
        ));

        // When / Then
        assertBusinessError(
                () -> createRegistration(applicant, recruitment),
                ErrorCode.GROUP_MEMBER_ALREADY_EXISTS
        );
    }

    @DisplayName("같은 모집 공고에 기존 신청이 있으면 다시 신청할 수 없다.")
    @Test
    void rejectsDuplicateRegistrationForSameRecruitment() {
        // Given
        Member applicant = saveMember("새봄", "registration-service-duplicate-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 3);
        registrationRepository.save(Registration.createPending(
                recruitment,
                applicant,
                null,
                TestSupportConfig.FIXED_NOW.minusHours(1)
        ));

        // When / Then
        assertBusinessError(
                () -> createRegistration(applicant, recruitment),
                ErrorCode.REGISTRATION_ALREADY_EXISTS
        );
    }

    @DisplayName("같은 그룹의 다른 모집 공고에 대기 신청이 있으면 새로 신청할 수 없다.")
    @Test
    void rejectsRegistrationWhenGroupHasAnotherPendingRegistration() {
        // Given
        Member applicant = saveMember("아라", "registration-service-group-pending-applicant");
        Group group = saveActiveGroup("다른 공고 대기 신청 그룹");
        GroupRecruitment previousRecruitment = saveRecruitment(
                group,
                JoinMethod.APPROVAL,
                3,
                TestSupportConfig.FIXED_NOW.minusDays(7),
                TestSupportConfig.FIXED_NOW.minusDays(1)
        );
        registrationRepository.save(Registration.createPending(
                previousRecruitment,
                applicant,
                null,
                TestSupportConfig.FIXED_NOW.minusDays(2)
        ));
        GroupRecruitment currentRecruitment = saveRecruitment(
                group,
                JoinMethod.APPROVAL,
                3,
                TestSupportConfig.FIXED_NOW.minusHours(1),
                TestSupportConfig.FIXED_NOW.plusDays(7)
        );

        // When / Then
        assertBusinessError(
                () -> createRegistration(applicant, currentRecruitment),
                ErrorCode.GROUP_PENDING_REGISTRATION_EXISTS
        );
    }

    @DisplayName("자동 가입 모집의 정원이 이미 소진되었으면 신청할 수 없다.")
    @Test
    void rejectsAutoRegistrationWhenCapacityIsFull() {
        // Given
        Member approvedMember = saveMember("윤슬", "registration-service-approved-member");
        Member applicant = saveMember("이든", "registration-service-full-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.AUTO, 1);
        registrationRepository.save(Registration.createAutoApproved(
                recruitment,
                approvedMember,
                null,
                TestSupportConfig.FIXED_NOW.minusHours(1),
                0
        ));
        groupMemberRepository.save(GroupMember.createMember(
                recruitment.getGroup(),
                approvedMember,
                TestSupportConfig.FIXED_NOW.minusHours(1)
        ));

        // When / Then
        assertBusinessError(
                () -> createRegistration(applicant, recruitment),
                ErrorCode.RECRUITMENT_CAPACITY_EXCEEDED
        );
    }

    @DisplayName("정원이 1명인 자동 가입 모집에 동시에 신청해도 한 명만 승인한다.")
    @Test
    void serializesConcurrentAutoRegistrations() throws Exception {
        // Given
        Member firstApplicant = saveMember("하람", "registration-service-concurrent-first");
        Member secondApplicant = saveMember("해솔", "registration-service-concurrent-second");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.AUTO, 1);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            Future<RegistrationAttempt> first = executor.submit(
                    () -> createWhenReleased(start, firstApplicant.getId(), recruitment.getId())
            );
            Future<RegistrationAttempt> second = executor.submit(
                    () -> createWhenReleased(start, secondApplicant.getId(), recruitment.getId())
            );

            // When
            start.countDown();
            List<RegistrationAttempt> attempts = List.of(
                    first.get(5, TimeUnit.SECONDS),
                    second.get(5, TimeUnit.SECONDS)
            );

            // Then
            assertThat(attempts)
                    .filteredOn(attempt -> attempt.status() == RegistrationStatus.APPROVED)
                    .hasSize(1);
            assertThat(attempts)
                    .filteredOn(attempt -> attempt.errorCode() == ErrorCode.RECRUITMENT_CAPACITY_EXCEEDED)
                    .hasSize(1);
            assertThat(registrationRepository.countByRecruitmentIdAndStatus(
                    recruitment.getId(),
                    RegistrationStatus.APPROVED
            )).isEqualTo(1);
            assertThat(groupMemberJpaRepository.findAllByGroupIdInOrderById(
                    List.of(recruitment.getGroup().getId())
            )).hasSize(1);
        } finally {
            executor.shutdownNow();
        }
    }

    private RegistrationAttempt createWhenReleased(CountDownLatch start, long memberId, long recruitmentId) {
        try {
            if (!start.await(3, TimeUnit.SECONDS)) {
                throw new IllegalStateException("동시 가입 신청 시작 대기 시간이 초과되었습니다.");
            }
            CreateRegistrationResult result = registrationCommandService.createRegistration(
                    memberId,
                    recruitmentId,
                    new CreateRegistrationCommand(null)
            );
            return RegistrationAttempt.succeeded(result.status());
        } catch (BusinessException exception) {
            return RegistrationAttempt.failed(exception.getErrorCode());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("동시 가입 신청 테스트가 중단되었습니다.", exception);
        }
    }

    @DisplayName("같은 회원이 같은 그룹의 서로 다른 승인제 모집에 동시에 신청해도 하나만 대기 상태가 된다.")
    @Test
    void serializesConcurrentApprovalRegistrationsWithinGroup() throws Exception {
        // Given
        Member applicant = saveMember("한결", "registration-service-concurrent-group-applicant");
        Group group = saveActiveGroup("그룹 단위 가입 신청 동시성 그룹");
        GroupRecruitment firstRecruitment = saveRecruitment(
                group,
                JoinMethod.APPROVAL,
                3,
                TestSupportConfig.FIXED_NOW.minusDays(1),
                TestSupportConfig.FIXED_NOW.plusDays(7)
        );
        GroupRecruitment secondRecruitment = saveRecruitment(
                group,
                JoinMethod.APPROVAL,
                3,
                TestSupportConfig.FIXED_NOW.minusDays(1),
                TestSupportConfig.FIXED_NOW.plusDays(7)
        );
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            Future<RegistrationAttempt> first = executor.submit(
                    () -> createWhenReleased(start, applicant.getId(), firstRecruitment.getId())
            );
            Future<RegistrationAttempt> second = executor.submit(
                    () -> createWhenReleased(start, applicant.getId(), secondRecruitment.getId())
            );

            // When
            start.countDown();
            List<RegistrationAttempt> attempts = List.of(
                    first.get(5, TimeUnit.SECONDS),
                    second.get(5, TimeUnit.SECONDS)
            );

            // Then
            assertThat(attempts)
                    .filteredOn(attempt -> attempt.status() == RegistrationStatus.PENDING)
                    .hasSize(1);
            assertThat(attempts)
                    .filteredOn(attempt -> attempt.errorCode() == ErrorCode.GROUP_PENDING_REGISTRATION_EXISTS)
                    .hasSize(1);
            long pendingCount = registrationRepository.countByRecruitmentIdAndStatus(
                    firstRecruitment.getId(),
                    RegistrationStatus.PENDING
            ) + registrationRepository.countByRecruitmentIdAndStatus(
                    secondRecruitment.getId(),
                    RegistrationStatus.PENDING
            );
            assertThat(pendingCount).isEqualTo(1);
        } finally {
            executor.shutdownNow();
        }
    }

    private record RegistrationAttempt(RegistrationStatus status, ErrorCode errorCode) {

        private static RegistrationAttempt succeeded(RegistrationStatus status) {
            return new RegistrationAttempt(status, null);
        }

        private static RegistrationAttempt failed(ErrorCode errorCode) {
            return new RegistrationAttempt(null, errorCode);
        }
    }

    private record DecisionAttempt(boolean succeeded, ErrorCode errorCode) {

        private static DecisionAttempt success() {
            return new DecisionAttempt(true, null);
        }

        private static DecisionAttempt failure(ErrorCode errorCode) {
            return new DecisionAttempt(false, errorCode);
        }
    }

    private record WithdrawalAttempt(boolean succeeded, ErrorCode errorCode) {

        private static WithdrawalAttempt success() {
            return new WithdrawalAttempt(true, null);
        }

        private static WithdrawalAttempt failure(ErrorCode errorCode) {
            return new WithdrawalAttempt(false, errorCode);
        }
    }
}
