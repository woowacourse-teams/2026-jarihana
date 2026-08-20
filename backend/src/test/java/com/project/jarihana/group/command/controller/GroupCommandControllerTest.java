package com.project.jarihana.group.command.controller;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.project.jarihana.common.auth.AccessTokenProvider;
import com.project.jarihana.common.auth.JwtProperties;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class GroupCommandControllerTest extends IntegrationTestSupport {

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private GroupMemberJpaRepository groupMemberRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private JwtProperties jwtProperties;

    @DisplayName("모임장은 그룹 기본 정보 전체 교체 결과를 상세 응답으로 받는다.")
    @Test
    void replacesGroupBasicInformation() {
        // Given
        Member leader = memberRepository.save(Member.create("가온", 8, "github-controller-leader", Course.BACKEND));
        Group group = createGroup(leader);
        String accessToken = accessTokenProvider.issue(leader.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When / Then
        given()
                .cookie(jwtProperties.cookieName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("""
                        {
                          "name": "변경된 그룹",
                          "introduction": "변경된 소개",
                          "description": null
                        }
                        """)
                .when()
                .put("/api/groups/{groupId}", group.getId())
                .then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.id", equalTo(group.getId().intValue()))
                .body("data.name", equalTo("변경된 그룹"))
                .body("data.introduction", equalTo("변경된 소개"))
                .body("data.description", nullValue())
                .body("data.representativeImageUrl", equalTo("images/default-group.png"))
                .body("data.recurringSchedule.startTime", equalTo("19:00:00"))
                .body("error", nullValue());
    }

    @DisplayName("모임장이 아닌 회원의 그룹 기본 정보 교체 요청은 거부한다.")
    @Test
    void rejectsModifyRequestFromNonLeader() {
        // Given
        Member leader = memberRepository.save(Member.create("가온", 8, "github-controller-owner", Course.BACKEND));
        Member member = memberRepository.save(Member.create("누리", 8, "github-controller-member", Course.BACKEND));
        Group group = createGroup(leader);
        groupMemberRepository.save(GroupMember.createMember(group, member, TestSupportConfig.FIXED_NOW));
        String accessToken = accessTokenProvider.issue(member.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When
        ExtractableResponse<Response> response = given()
                .cookie(jwtProperties.cookieName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("""
                        {
                          "name": "변경 시도",
                          "introduction": "소개",
                          "description": null
                        }
                        """)
                .when()
                .put("/api/groups/{groupId}", group.getId())
                .then()
                .extract();

        // Then
        org.assertj.core.api.Assertions.assertThat(response.statusCode()).isEqualTo(403);
        org.assertj.core.api.Assertions.assertThat(response.jsonPath().getString("error.code"))
                .isEqualTo("GROUP_ACCESS_DENIED");
    }

    private Group createGroup(Member leader) {
        Group group = groupRepository.save(Group.createStudy(
                "컨트롤러 기존 그룹",
                "기존 소개",
                "기존 설명",
                "groups/original.webp",
                RecurringGroupSchedule.of(
                        Set.of(DayOfWeek.MONDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)),
                TestSupportConfig.FIXED_NOW
        ));
        groupMemberRepository.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW));
        return group;
    }

    private String csrfToken(Long groupId) {
        ExtractableResponse<Response> response = given()
                .when()
                .get("/api/groups/{groupId}", groupId)
                .then()
                .extract();
        return response.cookie("XSRF-TOKEN");
    }
}
