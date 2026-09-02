package com.project.jarihana.registration.command.controller;

import com.project.jarihana.common.auth.AccessTokenProvider;
import com.project.jarihana.common.auth.AuthCookieProperties;
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
import com.project.jarihana.registration.domain.DecisionActor;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;

class RegistrationCommandControllerTest extends IntegrationTestSupport {

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private GroupRecruitmentCommandRepository recruitmentRepository;

    @Autowired
    private GroupMemberCommandRepository groupMemberRepository;

    @Autowired
    private RegistrationCommandRepository registrationRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @DisplayName("신청자가 자신의 대기 신청을 철회하면 본문 없이 응답하고 신청을 삭제한다.")
    @Test
    void withdrawsOwnPendingRegistration() {
        // Given
        Member applicant = saveMember("가온", "registration-controller-withdrawal-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 2);
        Registration registration = registrationRepository.save(Registration.createPending(
                recruitment,
                applicant,
                null,
                TestSupportConfig.FIXED_NOW.minusHours(1)
        ));
        String accessToken = accessTokenProvider.issue(applicant.getId()).value();
        String csrfToken = csrfToken(recruitment.getGroup().getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .when()
                .delete(
                        "/recruitments/{recruitmentId}/registrations/{registrationId}",
                        recruitment.getId(),
                        registration.getId()
                )
                .then()
                .statusCode(204)
                .body(equalTo(""));
        assertThat(registrationRepository.existsByRecruitmentIdAndMemberId(
                recruitment.getId(),
                applicant.getId()
        )).isFalse();
    }

    private RequestSpecification authenticatedRequest(String accessToken, String csrfToken) {
        return given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json");
    }

    private Member saveMember(String crewName, String githubId) {
        return memberRepository.save(Member.create(crewName, 8, githubId, Course.BACKEND));
    }

    private GroupRecruitment saveRecruitment(JoinMethod joinMethod, int capacity) {
        return saveRecruitment("가입 신청 API 그룹 " + joinMethod, joinMethod, capacity);
    }

    private GroupRecruitment saveRecruitment(String groupName, JoinMethod joinMethod, int capacity) {
        Group group = groupRepository.save(Group.createClub(
                groupName,
                "함께 활동해요",
                null,
                null,
                null,
                TestSupportConfig.FIXED_NOW.minusDays(10)
        ));
        return recruitmentRepository.save(GroupRecruitment.create(
                group,
                joinMethod,
                capacity,
                TestSupportConfig.FIXED_NOW.minusDays(1),
                TestSupportConfig.FIXED_NOW.plusDays(7)
        ));
    }

    private String csrfToken(long groupId) {
        ExtractableResponse<Response> response = given()
                .when()
                .get("/groups/{groupId}", groupId)
                .then()
                .extract();
        return response.cookie("XSRF-TOKEN");
    }

    @DisplayName("모임장이 신청 관리 화면에서 확인한 마지막 신청까지 읽음 처리한다.")
    @Test
    void marksRegistrationsRead() {
        // Given
        Member leader = saveMember("확인리더", "registration-read-controller-leader");
        Member applicant = saveMember("확인자", "registration-read-controller-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 3);
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
        String accessToken = accessTokenProvider.issue(leader.getId()).value();
        String csrfToken = csrfToken(recruitment.getGroup().getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body("{\"throughRegistrationId\":" + registration.getId() + "}")
                .when()
                .patch("/recruitments/{recruitmentId}/registrations/read", recruitment.getId())
                .then()
                .statusCode(204)
                .body(equalTo(""));

        assertThat(registrationRepository.findById(registration.getId()))
                .get()
                .extracting(Registration::getLeaderViewedAt)
                .isEqualTo(TestSupportConfig.FIXED_NOW);
    }

    @DisplayName("다른 회원의 가입 신청을 철회하면 접근 거부로 응답한다.")
    @Test
    void rejectsWithdrawalOfAnotherMembersRegistration() {
        // Given
        Member applicant = saveMember("가람", "withdrawal-api-owner");
        Member requester = saveMember("나래", "withdrawal-api-requester");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 2);
        Registration registration = registrationRepository.save(Registration.createPending(
                recruitment,
                applicant,
                null,
                TestSupportConfig.FIXED_NOW.minusHours(1)
        ));
        String accessToken = accessTokenProvider.issue(requester.getId()).value();
        String csrfToken = csrfToken(recruitment.getGroup().getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .when()
                .delete(
                        "/recruitments/{recruitmentId}/registrations/{registrationId}",
                        recruitment.getId(),
                        registration.getId()
                )
                .then()
                .statusCode(403)
                .body("success", equalTo(false))
                .body("data", nullValue())
                .body("error.code", equalTo("REGISTRATION_ACCESS_DENIED"));
        assertThat(registrationRepository.existsByRecruitmentIdAndMemberId(
                recruitment.getId(),
                applicant.getId()
        )).isTrue();
    }

    @DisplayName("가입 신청이 요청한 모집 공고에 속하지 않으면 찾을 수 없는 신청으로 응답한다.")
    @Test
    void rejectsWithdrawalForRegistrationFromAnotherRecruitment() {
        // Given
        Member applicant = saveMember("라온", "withdrawal-api-another-recruitment");
        GroupRecruitment requestedRecruitment = saveRecruitment(
                "가입 신청 철회 대상 공고 그룹",
                JoinMethod.APPROVAL,
                2
        );
        GroupRecruitment anotherRecruitment = saveRecruitment(
                "가입 신청 철회 다른 공고 그룹",
                JoinMethod.APPROVAL,
                3
        );
        Registration registration = registrationRepository.save(Registration.createPending(
                anotherRecruitment,
                applicant,
                null,
                TestSupportConfig.FIXED_NOW.minusHours(1)
        ));
        String accessToken = accessTokenProvider.issue(applicant.getId()).value();
        String csrfToken = csrfToken(requestedRecruitment.getGroup().getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .when()
                .delete(
                        "/recruitments/{recruitmentId}/registrations/{registrationId}",
                        requestedRecruitment.getId(),
                        registration.getId()
                )
                .then()
                .statusCode(404)
                .body("success", equalTo(false))
                .body("data", nullValue())
                .body("error.code", equalTo("REGISTRATION_NOT_FOUND"));
    }

    @DisplayName("이미 결정된 가입 신청을 철회하면 상태 충돌로 응답한다.")
    @Test
    void rejectsWithdrawalOfDecidedRegistration() {
        // Given
        Member applicant = saveMember("마루", "withdrawal-api-decided-applicant");
        Member decider = saveMember("보라", "withdrawal-api-decider");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 2);
        Registration registration = registrationRepository.save(
                Registration.createPending(
                                recruitment,
                                applicant,
                                null,
                                TestSupportConfig.FIXED_NOW.minusHours(1)
                        )
                        .approve(DecisionActor.member(decider.getId()), TestSupportConfig.FIXED_NOW, 0)
        );
        String accessToken = accessTokenProvider.issue(applicant.getId()).value();
        String csrfToken = csrfToken(recruitment.getGroup().getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .when()
                .delete(
                        "/recruitments/{recruitmentId}/registrations/{registrationId}",
                        recruitment.getId(),
                        registration.getId()
                )
                .then()
                .statusCode(409)
                .body("success", equalTo(false))
                .body("data", nullValue())
                .body("error.code", equalTo("REGISTRATION_ALREADY_DECIDED"));
    }

    @DisplayName("모임장이 대기 신청을 승인하면 결정 정보와 함께 응답하고 신청자를 구성원으로 등록한다.")
    @Test
    void approvesRegistration() {
        // Given
        Member leader = saveMember("가온", "registration-controller-decision-leader");
        Member applicant = saveMember("가람", "registration-controller-decision-applicant");
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
        String accessToken = accessTokenProvider.issue(leader.getId()).value();
        String csrfToken = csrfToken(recruitment.getGroup().getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body("""
                        {
                          "status": "APPROVED"
                        }
                        """)
                .when()
                .patch(
                        "/recruitments/{recruitmentId}/registrations/{registrationId}",
                        recruitment.getId(),
                        registration.getId()
                )
                .then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.id", equalTo(1))
                .body("data.status", equalTo("APPROVED"))
                .body("data.decisionReason", nullValue())
                .body("data.decidedAt", equalTo("2026-08-19T10:00:00"))
                .body("data.decidedBy.type", equalTo("MEMBER"))
                .body("data.decidedBy.memberId", equalTo(leader.getId().intValue()))
                .body("error", nullValue());

        assertThat(groupMemberRepository.findByGroupIdAndMemberId(
                recruitment.getGroup().getId(),
                applicant.getId()
        )).isPresent();
    }

    @DisplayName("모임장이 대기 신청을 거절하면 사유와 결정 주체를 응답하고 구성원을 만들지 않는다.")
    @Test
    void rejectsRegistration() {
        // Given
        Member leader = saveMember("나래", "registration-controller-rejection-leader");
        Member applicant = saveMember("누리", "registration-controller-rejection-applicant");
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
        String accessToken = accessTokenProvider.issue(leader.getId()).value();
        String csrfToken = csrfToken(recruitment.getGroup().getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body("""
                        {
                          "status": "REJECTED",
                          "decisionReason": "모집 방향과 맞지 않습니다."
                        }
                        """)
                .when()
                .patch(
                        "/recruitments/{recruitmentId}/registrations/{registrationId}",
                        recruitment.getId(),
                        registration.getId()
                )
                .then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.status", equalTo("REJECTED"))
                .body("data.decisionReason", equalTo("모집 방향과 맞지 않습니다."))
                .body("data.decidedAt", equalTo("2026-08-19T10:00:00"))
                .body("data.decidedBy.type", equalTo("MEMBER"))
                .body("data.decidedBy.memberId", equalTo(leader.getId().intValue()))
                .body("error", nullValue());

        assertThat(groupMemberRepository.findByGroupIdAndMemberId(
                recruitment.getGroup().getId(),
                applicant.getId()
        )).isEmpty();
    }

    @DisplayName("승인 요청에 거절 사유를 함께 보내면 잘못된 요청으로 응답한다.")
    @Test
    void rejectsApprovalWithDecisionReason() {
        // Given
        Member leader = saveMember("다온", "registration-controller-invalid-approval-leader");
        Member applicant = saveMember("라온", "registration-controller-invalid-approval-applicant");
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
        String accessToken = accessTokenProvider.issue(leader.getId()).value();
        String csrfToken = csrfToken(recruitment.getGroup().getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body("""
                        {
                          "status": "APPROVED",
                          "decisionReason": "승인에는 사유를 보낼 수 없습니다."
                        }
                        """)
                .when()
                .patch(
                        "/recruitments/{recruitmentId}/registrations/{registrationId}",
                        recruitment.getId(),
                        registration.getId()
                )
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("data", nullValue())
                .body("error.code", equalTo("INVALID_PARAMETER"));
    }

    @DisplayName("지원하지 않는 신청 처리 상태면 잘못된 요청으로 응답한다.")
    @Test
    void rejectsUnsupportedDecisionStatus() {
        // Given
        Member leader = saveMember("마루", "registration-controller-invalid-status-leader");
        Member applicant = saveMember("보라", "registration-controller-invalid-status-applicant");
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
        String accessToken = accessTokenProvider.issue(leader.getId()).value();
        String csrfToken = csrfToken(recruitment.getGroup().getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body("{\"status\":\"PENDING\"}")
                .when()
                .patch(
                        "/recruitments/{recruitmentId}/registrations/{registrationId}",
                        recruitment.getId(),
                        registration.getId()
                )
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("data", nullValue())
                .body("error.code", equalTo("INVALID_PARAMETER"));
    }

    @DisplayName("가입 신청 결정 사유가 1000자를 초과하면 잘못된 요청으로 응답한다.")
    @Test
    void rejectsTooLongDecisionReason() {
        // Given
        Member leader = saveMember("새봄", "registration-controller-long-reason-leader");
        Member applicant = saveMember("아라", "registration-controller-long-reason-applicant");
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
        String accessToken = accessTokenProvider.issue(leader.getId()).value();
        String csrfToken = csrfToken(recruitment.getGroup().getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body("{\"status\":\"REJECTED\",\"decisionReason\":\"" + "가".repeat(1_001) + "\"}")
                .when()
                .patch(
                        "/recruitments/{recruitmentId}/registrations/{registrationId}",
                        recruitment.getId(),
                        registration.getId()
                )
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("data", nullValue())
                .body("error.code", equalTo("INVALID_PARAMETER"));
    }

    @DisplayName("모임장이 아니면 가입 신청 처리 요청을 거부한다.")
    @Test
    void rejectsDecisionByNonLeader() {
        // Given
        Member leader = saveMember("윤슬", "registration-controller-access-leader");
        Member requester = saveMember("이든", "registration-controller-access-requester");
        Member applicant = saveMember("하람", "registration-controller-access-applicant");
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
        String accessToken = accessTokenProvider.issue(requester.getId()).value();
        String csrfToken = csrfToken(recruitment.getGroup().getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body("{\"status\":\"APPROVED\"}")
                .when()
                .patch(
                        "/recruitments/{recruitmentId}/registrations/{registrationId}",
                        recruitment.getId(),
                        registration.getId()
                )
                .then()
                .statusCode(403)
                .body("success", equalTo(false))
                .body("data", nullValue())
                .body("error.code", equalTo("REGISTRATION_ACCESS_DENIED"));
    }

    @DisplayName("승인제 모집은 정원보다 많은 대기 신청을 생성할 수 있다.")
    @Test
    void createsPendingRegistration() {
        // Given
        Member previousApplicant = saveMember("가온", "registration-controller-previous-applicant");
        Member applicant = saveMember("가람", "registration-controller-approval-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 1);
        registrationRepository.save(Registration.createPending(
                recruitment,
                previousApplicant,
                null,
                TestSupportConfig.FIXED_NOW.minusHours(1)
        ));
        String accessToken = accessTokenProvider.issue(applicant.getId()).value();
        String csrfToken = csrfToken(recruitment.getGroup().getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body("""
                        {
                          "message": "함께 활동하고 싶습니다."
                        }
                        """)
                .when()
                .post("/recruitments/{recruitmentId}/registrations", recruitment.getId())
                .then()
                .statusCode(201)
                .body("success", equalTo(true))
                .body("data.id", equalTo(2))
                .body("data.status", equalTo("PENDING"))
                .body("data.registeredAt", equalTo("2026-08-19T10:00:00"))
                .body("data", not(hasKey("decidedAt")))
                .body("data", not(hasKey("decidedBy")))
                .body("error", nullValue());
    }

    @DisplayName("자동 가입 모집에 신청하면 즉시 승인하고 구성원을 생성하며 정원 도달 시 공고를 마감한다.")
    @Test
    void createsAutoApprovedRegistration() {
        // Given
        Member applicant = saveMember("나래", "registration-controller-auto-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.AUTO, 1);
        String accessToken = accessTokenProvider.issue(applicant.getId()).value();
        String csrfToken = csrfToken(recruitment.getGroup().getId());

        // When
        authenticatedRequest(accessToken, csrfToken)
                .body("{}")
                .when()
                .post("/recruitments/{recruitmentId}/registrations", recruitment.getId())
                .then()
                .statusCode(201)
                .body("success", equalTo(true))
                .body("data.id", equalTo(1))
                .body("data.status", equalTo("APPROVED"))
                .body("data.registeredAt", equalTo("2026-08-19T10:00:00"))
                .body("data.decidedAt", equalTo("2026-08-19T10:00:00"))
                .body("data.decidedBy.type", equalTo("SYSTEM"))
                .body("error", nullValue());

        // Then
        assertThat(groupMemberRepository.findByGroupIdAndMemberId(
                recruitment.getGroup().getId(),
                applicant.getId()
        )).isPresent();
        assertThat(recruitmentRepository.findAllByGroupId(recruitment.getGroup().getId()))
                .singleElement()
                .extracting(GroupRecruitment::getEndsAt)
                .isEqualTo(TestSupportConfig.FIXED_NOW);
    }

    @DisplayName("가입 신청 메시지가 1000자를 초과하면 잘못된 요청으로 응답한다.")
    @Test
    void rejectsTooLongMessage() {
        // Given
        Member applicant = saveMember("다솜", "registration-controller-long-message-applicant");
        GroupRecruitment recruitment = saveRecruitment(JoinMethod.APPROVAL, 3);
        String accessToken = accessTokenProvider.issue(applicant.getId()).value();
        String csrfToken = csrfToken(recruitment.getGroup().getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body("{\"message\":\"" + "가".repeat(1_001) + "\"}")
                .when()
                .post("/recruitments/{recruitmentId}/registrations", recruitment.getId())
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("data", nullValue())
                .body("error.code", equalTo("INVALID_PARAMETER"));
    }
}
