package com.project.jarihana.groupmember.command.controller;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

class GroupMemberCommandControllerTest extends IntegrationTestSupport {

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private GroupMemberJpaRepository groupMemberRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @DisplayName("모임장은 일반 구성원에게 역할을 위임하고 변경된 구성원 식별자를 받는다.")
    @Test
    void transfersLeadership() {
        // Given
        Member leaderMember = saveMember("가람", "controller-transfer-leader");
        Member successorMember = saveMember("나래", "controller-transfer-successor");
        Group group = saveActiveGroup("컨트롤러 역할 위임 그룹");
        GroupMember leader = groupMemberRepository.save(
                GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        GroupMember successor = groupMemberRepository.save(
                GroupMember.createMember(group, successorMember, TestSupportConfig.FIXED_NOW));
        String accessToken = accessTokenProvider.issue(leaderMember.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("""
                        {
                          "groupMemberId": %d
                        }
                        """.formatted(successor.getId()))
                .when()
                .put("/groups/{groupId}/leader", group.getId())
                .then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.groupId", equalTo(group.getId().intValue()))
                .body("data.previousLeaderGroupMemberId", equalTo(leader.getId().intValue()))
                .body("data.leaderGroupMemberId", equalTo(successor.getId().intValue()))
                .body("error", nullValue());

        assertThat(groupMemberRepository.findById(leader.getId()).orElseThrow().getRole())
                .isEqualTo(GroupMemberRole.MEMBER);
        assertThat(groupMemberRepository.findById(successor.getId()).orElseThrow().getRole())
                .isEqualTo(GroupMemberRole.LEADER);
    }

    private Member saveMember(String crewName, String githubId) {
        return memberRepository.save(Member.create(crewName, 8, githubId, Course.BACKEND));
    }

    private Group saveActiveGroup(String name) {
        return groupRepository.save(Group.createStudy(
                name,
                "함께 활동해요",
                null,
                null,
                RecurringGroupSchedule.of(
                        Set.of(DayOfWeek.MONDAY),
                        LocalTime.of(19, 0),
                        LocalTime.of(21, 0)
                ),
                TestSupportConfig.FIXED_NOW
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

    @DisplayName("인증 정보가 없으면 모임장 역할 위임 요청을 거부한다.")
    @Test
    void rejectsUnauthenticatedTransferRequest() {
        // Given
        Member leaderMember = saveMember("다솜", "controller-transfer-unauthenticated-leader");
        Member successorMember = saveMember("라미", "controller-transfer-unauthenticated-successor");
        Group group = saveActiveGroup("미인증 역할 위임 그룹");
        groupMemberRepository.save(
                GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        GroupMember successor = groupMemberRepository.save(
                GroupMember.createMember(group, successorMember, TestSupportConfig.FIXED_NOW));
        String csrfToken = csrfToken(group.getId());

        // When / Then
        given()
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("{\"groupMemberId\":%d}".formatted(successor.getId()))
                .when()
                .put("/groups/{groupId}/leader", group.getId())
                .then()
                .statusCode(401)
                .body("success", equalTo(false))
                .body("error.code", equalTo("UNAUTHENTICATED"));
    }

    @DisplayName("CSRF 토큰이 없으면 모임장 역할 위임 요청을 거부한다.")
    @Test
    void rejectsTransferRequestWithoutCsrfToken() {
        // Given
        Member leaderMember = saveMember("마리", "controller-transfer-no-csrf-leader");
        Member successorMember = saveMember("보미", "controller-transfer-no-csrf-successor");
        Group group = saveActiveGroup("CSRF 없는 역할 위임 그룹");
        groupMemberRepository.save(
                GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        GroupMember successor = groupMemberRepository.save(
                GroupMember.createMember(group, successorMember, TestSupportConfig.FIXED_NOW));
        String accessToken = accessTokenProvider.issue(leaderMember.getId()).value();

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .contentType("application/json")
                .body("{\"groupMemberId\":%d}".formatted(successor.getId()))
                .when()
                .put("/groups/{groupId}/leader", group.getId())
                .then()
                .statusCode(403)
                .body("success", equalTo(false))
                .body("error.code", equalTo("ACCESS_DENIED"));
    }

    @DisplayName("위임 대상 식별자가 없으면 400을 반환한다.")
    @Test
    void rejectsTransferRequestWithoutGroupMemberId() {
        // Given
        Member leaderMember = saveMember("소담", "controller-transfer-invalid-leader");
        Group group = saveActiveGroup("잘못된 역할 위임 요청 그룹");
        groupMemberRepository.save(
                GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        String accessToken = accessTokenProvider.issue(leaderMember.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("{}")
                .when()
                .put("/groups/{groupId}/leader", group.getId())
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("error.code", equalTo("INVALID_PARAMETER"));
    }

    @DisplayName("종료된 그룹의 모임장 역할 위임 요청은 맥락이 담긴 422를 반환한다.")
    @Test
    void rejectsTransferRequestForEndedGroup() {
        // Given
        Member leaderMember = saveMember("아라", "controller-transfer-ended-leader");
        Member successorMember = saveMember("윤슬", "controller-transfer-ended-successor");
        Group group = saveActiveGroup("종료된 역할 위임 그룹");
        groupMemberRepository.save(
                GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        GroupMember successor = groupMemberRepository.save(
                GroupMember.createMember(group, successorMember, TestSupportConfig.FIXED_NOW));
        String accessToken = accessTokenProvider.issue(leaderMember.getId()).value();
        String csrfToken = csrfToken(group.getId());
        groupRepository.save(group.endAt(TestSupportConfig.FIXED_NOW.plusDays(1).plusMinutes(1)));

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("{\"groupMemberId\":%d}".formatted(successor.getId()))
                .when()
                .put("/groups/{groupId}/leader", group.getId())
                .then()
                .statusCode(422)
                .body("success", equalTo(false))
                .body("error.code", equalTo("LEADER_DELEGATION_NOT_ALLOWED_FOR_ENDED_GROUP"))
                .body("error.message", equalTo("종료된 그룹에서는 모임장 역할을 위임할 수 없습니다."));
    }

    @DisplayName("현재 모임장이 아닌 구성원의 역할 위임 요청은 403을 반환한다.")
    @Test
    void rejectsTransferRequestFromNonLeader() {
        // Given
        Member leaderMember = saveMember("하늬", "controller-transfer-owner");
        Member requesterMember = saveMember("해나", "controller-transfer-non-leader");
        Group group = saveActiveGroup("권한 없는 역할 위임 그룹");
        groupMemberRepository.save(
                GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        GroupMember requester = groupMemberRepository.save(
                GroupMember.createMember(group, requesterMember, TestSupportConfig.FIXED_NOW));
        String accessToken = accessTokenProvider.issue(requesterMember.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("{\"groupMemberId\":%d}".formatted(requester.getId()))
                .when()
                .put("/groups/{groupId}/leader", group.getId())
                .then()
                .statusCode(403)
                .body("success", equalTo(false))
                .body("error.code", equalTo("GROUP_ACCESS_DENIED"));
    }

    @DisplayName("해당 그룹에 없는 위임 대상을 요청하면 404를 반환한다.")
    @Test
    void rejectsUnknownSuccessor() {
        // Given
        Member leaderMember = saveMember("한결", "controller-transfer-unknown-successor-leader");
        Group group = saveActiveGroup("대상 없는 역할 위임 그룹");
        groupMemberRepository.save(
                GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        String accessToken = accessTokenProvider.issue(leaderMember.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("{\"groupMemberId\":999999}")
                .when()
                .put("/groups/{groupId}/leader", group.getId())
                .then()
                .statusCode(404)
                .body("success", equalTo(false))
                .body("error.code", equalTo("GROUP_MEMBER_NOT_FOUND"));
    }

    @DisplayName("현재 모임장 자신에게 역할을 위임하면 맥락이 담긴 422를 반환한다.")
    @Test
    void rejectsSelfDelegation() {
        // Given
        Member leaderMember = saveMember("호수", "controller-transfer-self-leader");
        Group group = saveActiveGroup("자기 역할 위임 그룹");
        GroupMember leader = groupMemberRepository.save(
                GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        String accessToken = accessTokenProvider.issue(leaderMember.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("{\"groupMemberId\":%d}".formatted(leader.getId()))
                .when()
                .put("/groups/{groupId}/leader", group.getId())
                .then()
                .statusCode(422)
                .body("success", equalTo(false))
                .body("error.code", equalTo("GROUP_MEMBER_ALREADY_LEADER"));
    }
}
