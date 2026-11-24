package com.project.jarihana.group.command.controller;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupVisibility;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.member.domain.MemberType;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static com.project.jarihana.support.TestSupportConfig.FIXED_NOW;
import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

class GroupVisibilityCommandAcceptanceTest extends IntegrationTestSupport {

    @Autowired private GroupJpaRepository groups;
    @Autowired private GroupMemberJpaRepository groupMembers;
    @Autowired private MemberRepository members;
    @Autowired private AccessTokenProvider accessTokens;
    @Autowired private AuthCookieProperties cookies;

    private Member crew;
    private Member basic;
    private String csrf;

    @BeforeEach
    void setUp() {
        csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        crew = members.save(Member.create("가온", 8, "visibility-crew", Course.BACKEND));
        basic = members.save(Member.createBasic("나래", "visibility-basic"));
    }

    @DisplayName("공개 범위를 보내지 않은 새 모임은 전체 공개다.")
    @Test
    void createsPublicGroupByDefault() {
        // When
        int groupId = as(basic).body("""
                        {"type":"CLUB","name":"기본 공개 모임","introduction":"누구나","meetingType":"ONLINE"}
                        """)
                .post("/groups").then().statusCode(201).extract().path("data.id");

        // Then
        given().get("/groups/{id}", groupId).then().statusCode(200)
                .body("data.visibility", equalTo("PUBLIC"));
    }

    @DisplayName("크루는 처음부터 크루 전용 모임을 만들 수 있고, 비로그인 사용자에게는 보이지 않는다.")
    @Test
    void crewCreatesCrewOnlyGroup() {
        // When
        int groupId = as(crew).body("""
                        {"type":"CLUB","name":"크루 모임","introduction":"크루끼리","meetingType":"ONLINE",
                         "visibility":"CREW_ONLY"}
                        """)
                .post("/groups").then().statusCode(201).extract().path("data.id");

        // Then
        as(crew).get("/groups/{id}", groupId).then().statusCode(200)
                .body("data.visibility", equalTo("CREW_ONLY"));
        given().get("/groups/{id}", groupId).then().statusCode(404)
                .body("error.code", equalTo("GROUP_NOT_FOUND"));
    }

    @DisplayName("크루가 아닌 회원은 크루 전용 모임을 만들 수 없다.")
    @Test
    void nonCrewCannotCreateCrewOnlyGroup() {
        // When & Then
        as(basic).body("""
                        {"type":"CLUB","name":"막힌 모임","introduction":"만들 수 없어요","meetingType":"ONLINE",
                         "visibility":"CREW_ONLY"}
                        """)
                .post("/groups").then().statusCode(403)
                .body("error.code", equalTo("GROUP_ACCESS_DENIED"));
        assertThat(groups.count()).isZero();
    }

    @DisplayName("크루인 모임장은 수정 화면에서 공개 범위를 바꾸고, 공개 범위를 빠뜨린 수정은 기존 값을 유지한다.")
    @Test
    void crewLeaderTogglesVisibility() {
        // Given
        Group group = groupLedBy(crew, "토글 모임");

        // When & Then
        modify(crew, group, ",\"visibility\":\"CREW_ONLY\"").then().statusCode(200)
                .body("data.visibility", equalTo("CREW_ONLY"));
        modify(crew, group, "").then().statusCode(200)
                .body("data.visibility", equalTo("CREW_ONLY"));
        modify(crew, group, ",\"visibility\":\"PUBLIC\"").then().statusCode(200)
                .body("data.visibility", equalTo("PUBLIC"));
        assertThat(groups.findById(group.getId()).orElseThrow().getVisibility()).isEqualTo(GroupVisibility.PUBLIC);
    }

    @DisplayName("크루가 아닌 모임장은 크루 전용으로 바꿀 수 없지만 다른 정보는 고칠 수 있다.")
    @Test
    void nonCrewLeaderCannotTurnOnCrewOnly() {
        // Given
        Group group = groupLedBy(basic, "비크루 모임");

        // When & Then
        modify(basic, group, ",\"visibility\":\"CREW_ONLY\"").then().statusCode(403)
                .body("error.code", equalTo("GROUP_ACCESS_DENIED"));
        modify(basic, group, ",\"visibility\":\"PUBLIC\"").then().statusCode(200)
                .body("data.visibility", equalTo("PUBLIC"));
    }

    @DisplayName("위임으로 크루 전용 모임의 모임장이 된 비크루는 크루 전용을 끌 수 있지만 다시 켤 수는 없다.")
    @Test
    void delegatedNonCrewLeaderOnlyTurnsOff() {
        // Given
        Group group = groupLedBy(basic, "위임된 모임");
        groups.save(groups.findById(group.getId()).orElseThrow()
                .changeVisibility(GroupVisibility.CREW_ONLY, MemberType.CREW));

        // When & Then
        modify(basic, group, "").then().statusCode(200)
                .body("data.visibility", equalTo("CREW_ONLY"));
        modify(basic, group, ",\"visibility\":\"PUBLIC\"").then().statusCode(200)
                .body("data.visibility", equalTo("PUBLIC"));
        modify(basic, group, ",\"visibility\":\"CREW_ONLY\"").then().statusCode(403)
                .body("error.code", equalTo("GROUP_ACCESS_DENIED"));
    }

    private Response modify(Member leader, Group group, String visibilityField) {
        return as(leader).body("""
                        {"name":"%s","introduction":"새 소개","description":null,"meetingType":"ONLINE",
                         "location":null,"representativeImageKey":null%s}
                        """.formatted(group.getName(), visibilityField))
                .put("/groups/{id}", group.getId());
    }

    private Group groupLedBy(Member leader, String name) {
        Group group = groups.save(Group.createClub(name, "소개", null, null, null, FIXED_NOW.minusDays(2)));
        groupMembers.save(GroupMember.createLeader(group, leader, FIXED_NOW.minusDays(2)));
        return group;
    }

    private RequestSpecification as(Member member) {
        return given().cookie(cookies.accessTokenName(), accessTokens.issue(member.getId()).value())
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json");
    }
}
