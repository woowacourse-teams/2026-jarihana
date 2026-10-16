package com.project.jarihana.recruitment;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.command.repository.GroupRecruitmentCommandRepository;
import com.project.jarihana.recruitment.command.service.RecruitmentCommandService;
import com.project.jarihana.recruitment.command.service.dto.UpdateRecruitmentCommand;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.recruitment.domain.RecruitmentPhase;
import com.project.jarihana.recruitment.query.repository.GroupRecruitmentJpaRepository;
import com.project.jarihana.registration.command.repository.RegistrationCommandRepository;
import com.project.jarihana.registration.command.service.RegistrationCommandService;
import com.project.jarihana.registration.command.service.dto.CreateRegistrationCommand;
import com.project.jarihana.registration.command.service.dto.DecideRegistrationCommand;
import com.project.jarihana.registration.command.service.dto.RegistrationDecision;
import com.project.jarihana.registration.domain.DecisionActor;
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

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.equalTo;

class RecruitmentCapacityIntegrationTest extends IntegrationTestSupport {
    private static final LocalDateTime NOW = TestSupportConfig.FIXED_NOW;

    @Autowired private GroupCommandRepository groups;
    @Autowired private GroupMemberCommandRepository groupMembers;
    @Autowired private MemberRepository members;
    @Autowired private GroupRecruitmentCommandRepository recruitments;
    @Autowired private GroupRecruitmentJpaRepository recruitmentQueries;
    @Autowired private RegistrationCommandRepository registrations;
    @Autowired private RegistrationCommandService registrationService;
    @Autowired private RecruitmentCommandService recruitmentService;
    @Autowired private AccessTokenProvider accessTokens;
    @Autowired private AuthCookieProperties cookies;
    private int memberSequence;

    @Test
    @DisplayName("모임·모집 목록과 상세는 모집으로 가입한 9명을 정원에 집계하고 초대로 합류한 2명은 실제 구성원에 포함한다.")
    void queriesAgreeOnRecruitmentCapacityAndActualMembership() {
        // Given
        Fixture fixture = fixture(10, 9, 2, JoinMethod.APPROVAL);
        // When & Then
        given().get("/groups").then().statusCode(200)
                .body("data.items[0].activeRecruitment.approvedCount", equalTo(9))
                .body("data.items[0].memberCount", equalTo(12));
        given().get("/groups/{id}", fixture.group().getId()).then().statusCode(200)
                .body("data.activeRecruitment.approvedCount", equalTo(9))
                .body("data.memberCount", equalTo(12));
        given().get("/groups/{id}/recruitments", fixture.group().getId()).then().statusCode(200)
                .body("data.items[0].approvedCount", equalTo(9));
        given().get("/groups/{id}/recruitments/{recruitmentId}", fixture.group().getId(), fixture.recruitment().getId())
                .then().statusCode(200)
                .body("data.approvedCount", equalTo(9))
                .body("data.remainingSeats", equalTo(1));
        given().cookie(cookies.accessTokenName(), accessTokens.issue(fixture.leader().getId()).value())
                .queryParam("status", "APPROVED").queryParam("size", 100)
                .get("/recruitments/{id}/registrations", fixture.recruitment().getId())
                .then().statusCode(200).body("data.items.size()", equalTo(11));
        assertThat(registrations.countByRecruitmentIdAndStatus(fixture.recruitment().getId(), RegistrationStatus.APPROVED))
                .isEqualTo(11);
    }

    @Test
    @DisplayName("모집 중 필터는 모집 기간과 모집으로 가입한 인원으로 true/false를 판단하며 초대 합류 인원은 제외한다.")
    void recruitingFiltersUseOnlyOrdinaryApprovals() {
        // Given
        Fixture available = fixture(10, 9, 2, JoinMethod.APPROVAL);
        Fixture full = fixture(10, 10, 1, JoinMethod.APPROVAL);
        // When & Then
        given().queryParam("recruiting", true).get("/groups").then().statusCode(200)
                .body("data.items.size()", equalTo(1))
                .body("data.items[0].id", equalTo(available.group().getId().intValue()));
        given().queryParam("recruiting", false).get("/groups").then().statusCode(200)
                .body("data.items.size()", equalTo(1))
                .body("data.items[0].id", equalTo(full.group().getId().intValue()));
    }

    @Test
    @DisplayName("선착순 가입은 모집으로 가입한 인원이 모집 정원에 도달하면 마감하며 초대 합류 인원은 정원 계산에서 제외한다.")
    void firstComeAdmissionClosesOnlyWhenOrdinaryApprovalsFillCapacity() {
        // Given
        Fixture fixture = fixture(2, 0, 2, JoinMethod.AUTO);
        Member first = member();
        Member second = member();
        // When
        registrationService.createRegistration(first.getId(), fixture.recruitment().getId(), new CreateRegistrationCommand(null));
        // Then
        assertThat(recruitmentQueries.findById(fixture.recruitment().getId()).orElseThrow().isOpenAt(NOW)).isTrue();
        registrationService.createRegistration(second.getId(), fixture.recruitment().getId(), new CreateRegistrationCommand(null));
        assertThat(recruitmentQueries.findById(fixture.recruitment().getId()).orElseThrow().getEndsAt()).isEqualTo(NOW);
        assertThat(registrations.countByRecruitmentIdAndStatus(fixture.recruitment().getId(), RegistrationStatus.APPROVED))
                .isEqualTo(4);
    }

    @Test
    @DisplayName("수동 승인은 남은 모집 자리를 사용하고 정원 도달 시 마감하며 초대 합류 인원은 정원 계산에서 제외한다.")
    void manualApprovalUsesRemainingOrdinaryRecruitmentSeat() {
        // Given
        Fixture fixture = fixture(2, 1, 2, JoinMethod.APPROVAL);
        Member applicant = member();
        Registration pending = registrations.save(Registration.createPending(fixture.recruitment(), applicant, null, NOW));
        // When
        registrationService.decideRegistration(fixture.leader().getId(), fixture.recruitment().getId(), pending.getId(),
                new DecideRegistrationCommand(RegistrationDecision.APPROVED, null));
        // Then
        assertThat(registrations.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(RegistrationStatus.APPROVED);
        assertThat(groupMembers.findByGroupIdAndMemberId(fixture.group().getId(), applicant.getId())).isPresent();
        assertThat(recruitmentQueries.findById(fixture.recruitment().getId()).orElseThrow().getEndsAt()).isEqualTo(NOW);
    }

    @ParameterizedTest
    @EnumSource(JoinMethod.class)
    @DisplayName("모집 정원이 차면 초대 이력과 무관하게 선착순 가입과 추가 수동 승인을 거부한다.")
    void ordinaryFullCapacityStillRejectsAdmission(JoinMethod joinMethod) {
        // Given
        Fixture fixture = fixture(1, 1, 2, joinMethod);
        Member applicant = member();
        // When & Then
        if (joinMethod == JoinMethod.AUTO) {
            assertCapacityError(() -> registrationService.createRegistration(applicant.getId(), fixture.recruitment().getId(),
                    new CreateRegistrationCommand(null)));
        } else {
            Registration pending = registrations.save(Registration.createPending(fixture.recruitment(), applicant, null, NOW));
            assertCapacityError(() -> registrationService.decideRegistration(fixture.leader().getId(), fixture.recruitment().getId(),
                    pending.getId(), new DecideRegistrationCommand(RegistrationDecision.APPROVED, null)));
        }
        assertThat(groupMembers.findByGroupIdAndMemberId(fixture.group().getId(), applicant.getId())).isEmpty();
    }

    @Test
    @DisplayName("모집 정원을 줄일 때는 모집으로 가입한 인원과 비교하며 같은 인원으로 줄이면 마감한다.")
    void capacityReductionIgnoresInvitationApprovals() {
        // Given
        Fixture fixture = fixture(10, 1, 2, JoinMethod.APPROVAL);
        // When
        var stillOpen = recruitmentService.updateRecruitment(fixture.leader().getId(), fixture.group().getId(),
                fixture.recruitment().getId(), settings(2));
        // Then
        assertThat(stillOpen.capacity()).isEqualTo(2);
        assertThat(stillOpen.phase()).isEqualTo(RecruitmentPhase.OPEN);
        var closed = recruitmentService.updateRecruitment(fixture.leader().getId(), fixture.group().getId(),
                fixture.recruitment().getId(), settings(1));
        assertThat(closed.phase()).isEqualTo(RecruitmentPhase.CLOSED);
        assertThat(closed.endsAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("모집 정원은 모집으로 가입한 인원보다 적게 줄일 수 없다.")
    void capacityCannotBeReducedBelowOrdinaryApprovals() {
        // Given
        Fixture fixture = fixture(10, 2, 2, JoinMethod.APPROVAL);
        // When & Then
        assertCapacityError(() -> recruitmentService.updateRecruitment(fixture.leader().getId(), fixture.group().getId(),
                fixture.recruitment().getId(), settings(1)));
        assertThat(recruitmentQueries.findById(fixture.recruitment().getId()).orElseThrow().getCapacity()).isEqualTo(10);
    }

    private Fixture fixture(int capacity, int ordinary, int invited, JoinMethod joinMethod) {
        Member leader = member();
        Group group = groups.save(Group.createClub("집계 모임 " + leader.getId(), "함께해요", null, null, null, NOW.minusDays(2)));
        groupMembers.save(GroupMember.createLeader(group, leader, NOW));
        GroupRecruitment recruitment = recruitments.save(GroupRecruitment.create(group, JoinMethod.APPROVAL,
                capacity, NOW.minusDays(1), NOW.plusDays(7)));
        for (int index = 0; index < ordinary + invited; index++) {
            Member member = member();
            Registration pending = Registration.createPending(recruitment, member, null, NOW.minusHours(1));
            registrations.save(index < ordinary
                    ? pending.approve(DecisionActor.member(leader.getId()), NOW, index)
                    : pending.approveByInvitation(NOW));
            groupMembers.save(GroupMember.createMember(group, member, NOW));
        }
        if (joinMethod == JoinMethod.AUTO) {
            recruitment = recruitments.save(recruitment.update(joinMethod, capacity, recruitment.getStartsAt(), recruitment.getEndsAt()));
        }
        return new Fixture(group, recruitment, leader);
    }

    private Member member() {
        int sequence = ++memberSequence;
        String crewName = "회원" + (char) ('가' + sequence);
        return members.save(Member.create(crewName, 8, "capacity-member-" + sequence, Course.BACKEND));
    }

    private UpdateRecruitmentCommand settings(int capacity) {
        return new UpdateRecruitmentCommand(JoinMethod.APPROVAL, capacity, NOW.minusDays(1), NOW.plusDays(7));
    }

    private void assertCapacityError(Runnable command) {
        assertThatThrownBy(command::run).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.RECRUITMENT_CAPACITY_EXCEEDED));
    }

    private record Fixture(Group group, GroupRecruitment recruitment, Member leader) {
    }
}
