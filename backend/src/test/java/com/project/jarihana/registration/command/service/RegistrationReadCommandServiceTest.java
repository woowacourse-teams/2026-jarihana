package com.project.jarihana.registration.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.command.repository.GroupRecruitmentCommandRepository;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.registration.command.repository.RegistrationCommandRepository;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RegistrationReadCommandServiceTest extends IntegrationTestSupport {

    @Autowired
    private RegistrationReadCommandService registrationReadCommandService;

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private GroupMemberCommandRepository groupMemberRepository;

    @Autowired
    private GroupRecruitmentCommandRepository recruitmentRepository;

    @Autowired
    private RegistrationCommandRepository registrationRepository;

    @Autowired
    private MemberRepository memberRepository;

    @DisplayName("모임장이 확인한 마지막 신청까지만 현재 모집에서 확인 시각을 기록한다.")
    @Test
    void marksRegistrationsViewedThroughRequestedRegistration() {
        // Given
        Member leader = saveMember("확인리더", "registration-read-service-leader");
        Member olderApplicant = saveMember("확인가온", "registration-read-service-older");
        Member newerApplicant = saveMember("확인나래", "registration-read-service-newer");
        Group group = saveActiveGroup("신청 확인 그룹");
        GroupRecruitment recruitment = saveRecruitment(group, JoinMethod.APPROVAL, 3);
        GroupRecruitment otherRecruitment = saveRecruitment(group, JoinMethod.AUTO, 3);
        groupMemberRepository.save(GroupMember.createLeader(
                group,
                leader,
                TestSupportConfig.FIXED_NOW.minusDays(1)
        ));
        Registration otherRecruitmentRegistration = registrationRepository.save(Registration.createAutoApproved(
                otherRecruitment,
                saveMember("확인다온", "registration-read-service-other-recruitment"),
                null,
                TestSupportConfig.FIXED_NOW.minusHours(3),
                0
        ));
        Registration older = registrationRepository.save(Registration.createPending(
                recruitment,
                olderApplicant,
                null,
                TestSupportConfig.FIXED_NOW.minusHours(2)
        ));
        Registration newer = registrationRepository.save(Registration.createPending(
                recruitment,
                newerApplicant,
                null,
                TestSupportConfig.FIXED_NOW.minusHours(1)
        ));

        // When
        registrationReadCommandService.markRegistrationsRead(
                leader.getId(),
                recruitment.getId(),
                older.getId()
        );

        // Then
        assertThat(registrationRepository.findById(older.getId()))
                .get()
                .extracting(Registration::getLeaderViewedAt)
                .isEqualTo(TestSupportConfig.FIXED_NOW);
        assertThat(registrationRepository.findById(newer.getId()))
                .get()
                .extracting(Registration::getLeaderViewedAt)
                .isNull();
        assertThat(registrationRepository.findById(otherRecruitmentRegistration.getId()))
                .get()
                .extracting(Registration::getLeaderViewedAt)
                .isNull();
    }

    @DisplayName("모임장이 아닌 회원은 신청을 확인 처리할 수 없다.")
    @Test
    void rejectsMarkingRegistrationsReadByNonLeader() {
        // Given
        Member member = saveMember("확인멤버", "registration-read-service-member");
        GroupRecruitment recruitment = saveRecruitment(
                saveActiveGroup("일반 회원 신청 확인 그룹"),
                JoinMethod.APPROVAL,
                3
        );

        // When / Then
        assertBusinessError(
                () -> registrationReadCommandService.markRegistrationsRead(
                        member.getId(),
                        recruitment.getId(),
                        1L
                ),
                ErrorCode.GROUP_ACCESS_DENIED
        );
    }

    @DisplayName("종료된 그룹의 신청은 확인 처리로 변경하지 않는다.")
    @Test
    void rejectsMarkingRegistrationsReadForEndedGroup() {
        // Given
        Member leader = saveMember("종료리더", "registration-read-service-ended-leader");
        Group group = saveActiveGroup("종료된 신청 확인 그룹");
        GroupRecruitment recruitment = saveRecruitment(group, JoinMethod.APPROVAL, 3);
        groupMemberRepository.save(GroupMember.createLeader(
                group,
                leader,
                TestSupportConfig.FIXED_NOW.minusDays(1)
        ));
        groupRepository.save(group.endAt(group.getCreatedAt().plusHours(25)));

        // When / Then
        assertBusinessError(
                () -> registrationReadCommandService.markRegistrationsRead(
                        leader.getId(),
                        recruitment.getId(),
                        1L
                ),
                ErrorCode.GROUP_ENDED
        );
    }

    private GroupRecruitment saveRecruitment(Group group, JoinMethod joinMethod, int capacity) {
        return recruitmentRepository.save(GroupRecruitment.create(
                group,
                joinMethod,
                capacity,
                TestSupportConfig.FIXED_NOW.minusDays(1),
                TestSupportConfig.FIXED_NOW.plusDays(7)
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

    private void assertBusinessError(Runnable action, ErrorCode errorCode) {
        assertThatThrownBy(action::run)
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(errorCode);
    }
}
