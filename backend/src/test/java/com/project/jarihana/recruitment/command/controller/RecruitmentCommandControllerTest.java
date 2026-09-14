package com.project.jarihana.recruitment.command.controller;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.command.repository.GroupRecruitmentCommandRepository;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

class RecruitmentCommandControllerTest extends IntegrationTestSupport {

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private GroupMemberJpaRepository groupMemberRepository;

    @Autowired
    private GroupRecruitmentCommandRepository recruitmentRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @DisplayName("모임장이 새 모집 공고를 등록하면 201과 생성 위치를 반환한다.")
    @Test
    void createsRecruitment() {
        // Given
        Member leaderMember = saveMember("다온", "recruitment-controller-leader");
        Group group = saveActiveGroup("모집 공고 API 그룹");
        groupMemberRepository.save(GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        String accessToken = accessTokenProvider.issue(leaderMember.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body("""
                        {
                          "joinMethod": "APPROVAL",
                          "capacity": 8,
                          "startsAt": "2026-08-20T00:00:00",
                          "endsAt": "2026-08-31T23:59:59"
                        }
                        """)
                .when()
                .post("/groups/{groupId}/recruitments", group.getId())
                .then()
                .statusCode(201)
                .header("Location", equalTo("/groups/%d/recruitments/1".formatted(group.getId())))
                .body("success", equalTo(true))
                .body("data.id", equalTo(1))
                .body("data.groupId", equalTo(group.getId().intValue()))
                .body("data.joinMethod", equalTo("APPROVAL"))
                .body("data.capacity", equalTo(8))
                .body("data.startsAt", equalTo("2026-08-20T00:00:00"))
                .body("data.endsAt", equalTo("2026-08-31T23:59:59"))
                .body("data.recruitingStatus", equalTo("SCHEDULED"))
                .body("error", nullValue());
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

    private String csrfToken(long groupId) {
        ExtractableResponse<Response> response = given()
                .when()
                .get("/groups/{groupId}", groupId)
                .then()
                .extract();
        return response.cookie("XSRF-TOKEN");
    }

    @DisplayName("모임장이 모집 공고를 조기 마감하면 200과 마감 상태를 반환한다.")
    @Test
    void closesRecruitment() {
        // Given
        Member leaderMember = saveMember("모아", "recruitment-close-controller-leader");
        Group group = saveActiveGroup("모집 공고 조기 마감 API 그룹");
        groupMemberRepository.save(GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        GroupRecruitment recruitment = saveOpenRecruitment(group);
        String accessToken = accessTokenProvider.issue(leaderMember.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body("""
                        {
                          "recruitingStatus": "CLOSED"
                        }
                        """)
                .when()
                .patch("/groups/{groupId}/recruitments/{recruitmentId}", group.getId(), recruitment.getId())
                .then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.id", equalTo(recruitment.getId().intValue()))
                .body("data.endsAt", equalTo("2026-08-19T10:00:00"))
                .body("data.recruitingStatus", equalTo("CLOSED"))
                .body("error", nullValue());
    }

    private GroupRecruitment saveOpenRecruitment(Group group) {
        return recruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.APPROVAL,
                3,
                TestSupportConfig.FIXED_NOW.minusDays(1),
                TestSupportConfig.FIXED_NOW.plusDays(7)
        ));
    }

    @DisplayName("CLOSED 이외의 모집 상태로 조기 마감을 요청하면 400을 반환한다.")
    @Test
    void rejectsNonClosedRecruitingStatus() {
        // Given
        Member leaderMember = saveMember("하람", "recruitment-close-controller-status-leader");
        Group group = saveActiveGroup("조기 마감 상태 오류 그룹");
        groupMemberRepository.save(GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        GroupRecruitment recruitment = saveOpenRecruitment(group);
        String accessToken = accessTokenProvider.issue(leaderMember.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body("""
                        {
                          "recruitingStatus": "OPEN"
                        }
                        """)
                .when()
                .patch("/groups/{groupId}/recruitments/{recruitmentId}", group.getId(), recruitment.getId())
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("error.code", equalTo("INVALID_PARAMETER"));
    }

    @DisplayName("현재 모임장이 아니면 모집 공고 조기 마감을 403으로 거부한다.")
    @Test
    void rejectsRecruitmentCloseFromNonLeader() {
        // Given
        Member leaderMember = saveMember("해솔", "recruitment-close-controller-owner");
        Member requesterMember = saveMember("누리", "recruitment-close-controller-non-leader");
        Group group = saveActiveGroup("비리더 조기 마감 API 그룹");
        groupMemberRepository.save(GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        groupMemberRepository.save(GroupMember.createMember(group, requesterMember, TestSupportConfig.FIXED_NOW));
        GroupRecruitment recruitment = saveOpenRecruitment(group);
        String accessToken = accessTokenProvider.issue(requesterMember.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body(closeBody())
                .when()
                .patch("/groups/{groupId}/recruitments/{recruitmentId}", group.getId(), recruitment.getId())
                .then()
                .statusCode(403)
                .body("success", equalTo(false))
                .body("error.code", equalTo("RECRUITMENT_ACCESS_DENIED"));
    }

    private String closeBody() {
        return """
                {
                  "recruitingStatus": "CLOSED"
                }
                """;
    }

    @DisplayName("해당 그룹에 속하지 않은 모집 공고의 조기 마감을 404로 거부한다.")
    @Test
    void rejectsRecruitmentCloseForDifferentGroup() {
        // Given
        Member leaderMember = saveMember("가온", "recruitment-close-different-group-leader");
        Group requestedGroup = saveActiveGroup("조기 마감 요청 API 그룹");
        Group otherGroup = saveActiveGroup("다른 모집 공고 API 그룹");
        groupMemberRepository.save(GroupMember.createLeader(
                requestedGroup,
                leaderMember,
                TestSupportConfig.FIXED_NOW
        ));
        GroupRecruitment otherRecruitment = saveOpenRecruitment(otherGroup);
        String accessToken = accessTokenProvider.issue(leaderMember.getId()).value();
        String csrfToken = csrfToken(requestedGroup.getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body(closeBody())
                .when()
                .patch(
                        "/groups/{groupId}/recruitments/{recruitmentId}",
                        requestedGroup.getId(),
                        otherRecruitment.getId()
                )
                .then()
                .statusCode(404)
                .body("success", equalTo(false))
                .body("error.code", equalTo("RECRUITMENT_NOT_FOUND"));
    }

    @DisplayName("이미 마감된 모집 공고의 조기 마감을 409로 거부한다.")
    @Test
    void rejectsAlreadyClosedRecruitment() {
        // Given
        Member leaderMember = saveMember("다인", "recruitment-close-controller-closed-leader");
        Group group = saveActiveGroup("이미 마감된 모집 공고 API 그룹");
        groupMemberRepository.save(GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        GroupRecruitment recruitment = recruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.APPROVAL,
                3,
                TestSupportConfig.FIXED_NOW.minusDays(7),
                TestSupportConfig.FIXED_NOW.minusDays(1)
        ));
        String accessToken = accessTokenProvider.issue(leaderMember.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body(closeBody())
                .when()
                .patch("/groups/{groupId}/recruitments/{recruitmentId}", group.getId(), recruitment.getId())
                .then()
                .statusCode(409)
                .body("success", equalTo(false))
                .body("error.code", equalTo("RECRUITMENT_ALREADY_CLOSED"));
    }

    @DisplayName("모집 인원이 1보다 작으면 400을 반환한다.")
    @Test
    void rejectsNonPositiveCapacity() {
        // Given
        Member leaderMember = saveMember("라온", "recruitment-controller-capacity-leader");
        Group group = saveActiveGroup("모집 인원 오류 그룹");
        groupMemberRepository.save(GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        String accessToken = accessTokenProvider.issue(leaderMember.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body("""
                        {
                          "joinMethod": "APPROVAL",
                          "capacity": 0,
                          "startsAt": "2026-08-20T00:00:00",
                          "endsAt": null
                        }
                        """)
                .when()
                .post("/groups/{groupId}/recruitments", group.getId())
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("error.code", equalTo("INVALID_PARAMETER"));
    }

    @DisplayName("모집 종료 시각이 시작 시각보다 빠르면 400을 반환한다.")
    @Test
    void rejectsInvalidRecruitmentPeriod() {
        // Given
        Member leaderMember = saveMember("마루", "recruitment-controller-period-leader");
        Group group = saveActiveGroup("모집 기간 오류 그룹");
        groupMemberRepository.save(GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        String accessToken = accessTokenProvider.issue(leaderMember.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body("""
                        {
                          "joinMethod": "AUTO",
                          "capacity": 3,
                          "startsAt": "2026-08-31T23:59:59",
                          "endsAt": "2026-08-20T00:00:00"
                        }
                        """)
                .when()
                .post("/groups/{groupId}/recruitments", group.getId())
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("error.code", equalTo("RECRUITMENT_INVALID_PERIOD"));
    }

    @DisplayName("현재 모임장이 아니면 새 모집 공고 등록을 403으로 거부한다.")
    @Test
    void rejectsRecruitmentCreationFromNonLeader() {
        // Given
        Member leaderMember = saveMember("보라", "recruitment-controller-owner");
        Member requesterMember = saveMember("새봄", "recruitment-controller-non-leader");
        Group group = saveActiveGroup("비리더 모집 등록 그룹");
        groupMemberRepository.save(GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        groupMemberRepository.save(GroupMember.createMember(group, requesterMember, TestSupportConfig.FIXED_NOW));
        String accessToken = accessTokenProvider.issue(requesterMember.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body(validBody())
                .when()
                .post("/groups/{groupId}/recruitments", group.getId())
                .then()
                .statusCode(403)
                .body("success", equalTo(false))
                .body("error.code", equalTo("GROUP_ACCESS_DENIED"));
    }

    private String validBody() {
        return """
                {
                  "joinMethod": "APPROVAL",
                  "capacity": 8,
                  "startsAt": "2026-08-20T00:00:00",
                  "endsAt": null
                }
                """;
    }

    @DisplayName("종료된 그룹의 새 모집 공고 등록을 409로 거부한다.")
    @Test
    void rejectsRecruitmentCreationForEndedGroup() {
        // Given
        Member leaderMember = saveMember("아라", "recruitment-controller-ended-leader");
        Group group = saveActiveGroup("종료된 모집 등록 그룹");
        groupMemberRepository.save(GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        groupRepository.save(group.endAt(TestSupportConfig.FIXED_NOW.plusDays(2)));
        String accessToken = accessTokenProvider.issue(leaderMember.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body(validBody())
                .when()
                .post("/groups/{groupId}/recruitments", group.getId())
                .then()
                .statusCode(409)
                .body("success", equalTo(false))
                .body("error.code", equalTo("GROUP_ENDED"));
    }

    @DisplayName("존재하지 않는 그룹의 새 모집 공고 등록을 404로 거부한다.")
    @Test
    void rejectsRecruitmentCreationForUnknownGroup() {
        // Given
        Member leaderMember = saveMember("윤슬", "recruitment-controller-missing-group-leader");
        Group group = saveActiveGroup("CSRF 발급용 그룹");
        groupMemberRepository.save(GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        String accessToken = accessTokenProvider.issue(leaderMember.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When / Then
        authenticatedRequest(accessToken, csrfToken)
                .body(validBody())
                .when()
                .post("/groups/{groupId}/recruitments", 999_999L)
                .then()
                .statusCode(404)
                .body("success", equalTo(false))
                .body("error.code", equalTo("GROUP_NOT_FOUND"));
    }
}
