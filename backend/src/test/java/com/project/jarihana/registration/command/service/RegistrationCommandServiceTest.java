package com.project.jarihana.registration.command.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.RegistrationStatus;
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

    private CreateRegistrationResult createRegistration(Member member, GroupRecruitment recruitment) {
        return registrationCommandService.createRegistration(
                member.getId(),
                recruitment.getId(),
                new CreateRegistrationCommand("함께하고 싶습니다.")
        );
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

    private void assertBusinessError(Runnable action, ErrorCode errorCode) {
        assertThatThrownBy(action::run)
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(errorCode);
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

    private record RegistrationAttempt(RegistrationStatus status, ErrorCode errorCode) {

        private static RegistrationAttempt succeeded(RegistrationStatus status) {
            return new RegistrationAttempt(status, null);
        }

        private static RegistrationAttempt failed(ErrorCode errorCode) {
            return new RegistrationAttempt(null, errorCode);
        }
    }
}
