package com.project.jarihana.registration.command.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;

import com.project.jarihana.common.auth.AccessTokenProvider;
import com.project.jarihana.common.auth.AuthCookieProperties;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
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
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

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
                .post("/api/recruitments/{recruitmentId}/registrations", recruitment.getId())
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
                .post("/api/recruitments/{recruitmentId}/registrations", recruitment.getId())
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
                .post("/api/recruitments/{recruitmentId}/registrations", recruitment.getId())
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("data", nullValue())
                .body("error.code", equalTo("INVALID_PARAMETER"));
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
        Group group = groupRepository.save(Group.createClub(
                "가입 신청 API 그룹 " + joinMethod,
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
                .get("/api/groups/{groupId}", groupId)
                .then()
                .extract();
        return response.cookie("XSRF-TOKEN");
    }
}
