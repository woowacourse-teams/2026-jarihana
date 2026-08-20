package com.project.jarihana.groupmember.query.controller;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class GroupMemberQueryControllerTest extends IntegrationTestSupport {

    private static final LocalDateTime JOINED_AT = LocalDateTime.of(2026, 8, 19, 10, 0);

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private GroupMemberJpaRepository groupMemberRepository;

    @Autowired
    private MemberRepository memberRepository;

    private Group group;

    @BeforeEach
    void setUp() {
        groupMemberRepository.deleteAllInBatch();
        groupRepository.deleteAllInBatch();

        group = groupRepository.save(Group.createStudy(
                "알고리즘 스터디",
                "함께 문제를 풉니다.",
                null,
                null,
                RecurringGroupSchedule.of(
                        Set.of(DayOfWeek.MONDAY),
                        LocalTime.of(19, 0),
                        LocalTime.of(21, 0)
                ),
                JOINED_AT.minusDays(1)
        ));
    }

    @DisplayName("인증 없이 그룹 구성원을 가입 최신순으로 커서 페이지 조회한다.")
    @Test
    void findsGroupMembersWithCursorPaginationWithoutAuthentication() {
        // Given
        Member leader = saveMember("가온", Course.BACKEND, "github-1");
        Member firstMember = saveMember("마루", Course.FRONTEND, "github-2");
        Member secondMember = saveMember("해음", Course.ANDROID, "github-3");
        groupMemberRepository.save(GroupMember.createLeader(group, leader, JOINED_AT));
        groupMemberRepository.save(GroupMember.createMember(group, firstMember, JOINED_AT.plusHours(1)));
        GroupMember latestMember = groupMemberRepository.save(
                GroupMember.createMember(group, secondMember, JOINED_AT.plusHours(1))
        );

        // When
        String nextCursor = given()
                .queryParam("size", 2)
                .when()
                .get("/api/groups/{groupId}/members", group.getId())
                .then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.items.size()", equalTo(2))
                .body("data.items[0].groupMemberId", equalTo(latestMember.getId().intValue()))
                .body("data.items[0].memberId", equalTo(secondMember.getId().intValue()))
                .body("data.items[0].crewName", equalTo("해음"))
                .body("data.items[0].generation", equalTo(8))
                .body("data.items[0].course", equalTo("ANDROID"))
                .body("data.items[0].role", equalTo("MEMBER"))
                .body("data.items[0].joinedAt", equalTo("2026-08-19T11:00:00"))
                .body("data.hasNext", equalTo(true))
                .body("error", nullValue())
                .extract()
                .path("data.nextCursor");

        // Then
        given()
                .queryParam("cursor", nextCursor)
                .queryParam("size", 2)
                .when()
                .get("/api/groups/{groupId}/members", group.getId())
                .then()
                .statusCode(200)
                .body("data.items.size()", equalTo(1))
                .body("data.items[0].memberId", equalTo(leader.getId().intValue()))
                .body("data.items[0].role", equalTo("LEADER"))
                .body("data.nextCursor", nullValue())
                .body("data.hasNext", equalTo(false));
    }

    @DisplayName("Hard Delete된 그룹 구성원은 목록에서 제외한다.")
    @Test
    void excludesHardDeletedGroupMember() {
        // Given
        Member leader = saveMember("가온", Course.BACKEND, "github-4");
        Member leavingMember = saveMember("마루", Course.FRONTEND, "github-5");
        GroupMember savedLeader = groupMemberRepository.save(GroupMember.createLeader(group, leader, JOINED_AT));
        GroupMember savedLeavingMember = groupMemberRepository.save(
                GroupMember.createMember(group, leavingMember, JOINED_AT.plusHours(1))
        );
        groupMemberRepository.delete(savedLeavingMember);
        groupMemberRepository.flush();

        // When / Then
        given()
                .when()
                .get("/api/groups/{groupId}/members", group.getId())
                .then()
                .statusCode(200)
                .body("data.items.size()", equalTo(1))
                .body("data.items[0].groupMemberId", equalTo(savedLeader.getId().intValue()))
                .body("data.items[0].role", equalTo("LEADER"));
    }

    @DisplayName("존재하지 않는 그룹의 구성원 목록은 404를 반환한다.")
    @Test
    void rejectsUnknownGroup() {
        // Given / When / Then
        given()
                .when()
                .get("/api/groups/{groupId}/members", 999L)
                .then()
                .statusCode(404)
                .body("success", equalTo(false))
                .body("data", nullValue())
                .body("error.code", equalTo("GROUP_NOT_FOUND"))
                .body("error.message", equalTo("그룹을 찾을 수 없습니다."));
    }

    @DisplayName("범위를 벗어난 페이지 크기는 400을 반환한다.")
    @Test
    void rejectsInvalidSize() {
        // Given / When / Then
        given()
                .queryParam("size", 0)
                .when()
                .get("/api/groups/{groupId}/members", group.getId())
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("error.code", equalTo("INVALID_PARAMETER"));
    }

    @DisplayName("형식이 잘못된 커서는 400을 반환한다.")
    @Test
    void rejectsInvalidCursor() {
        // Given / When / Then
        given()
                .queryParam("cursor", "invalid-cursor")
                .when()
                .get("/api/groups/{groupId}/members", group.getId())
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("error.code", equalTo("INVALID_PARAMETER"));
    }

    private Member saveMember(String crewName, Course course, String githubId) {
        return memberRepository.save(Member.create(crewName, 8, githubId, course));
    }
}
