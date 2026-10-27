package com.project.jarihana.chat;

import static io.restassured.RestAssured.given;

import static org.assertj.core.api.Assertions.assertThat;

import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;

import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.Map;
import java.util.UUID;

class ChatAcceptanceTest extends NotificationIntegrationTestSupport {
    @Autowired AccessTokenProvider tokens;

    @Test
    @DisplayName("채팅 목록은 모임 대표 이미지의 공개 접근 URL과 기본 이미지를 반환한다")
    void roomsReturnPublicRepresentativeImageUrlsAndDefaults() {
        // Given
        Member owner = member("121");
        Member outsider = member("122");
        Group custom = groups.save(Group.createClub(
                "사진 있는 모임", "소개", null, "groups/123/cover.webp", null, NOW));
        Group missing = groups.save(Group.createClub("사진 없는 모임", "소개", null, null, null, NOW));
        Group defaultImage = groups.save(Group.createClub(
                "기본 사진 모임", "소개", null, "images/default-group.png", null, NOW));
        for (Group group : new Group[] {custom, missing, defaultImage}) {
            groupMembers.save(GroupMember.createLeader(group, owner, NOW));
        }

        // When
        Response response = authenticated(owner).get("/chats");

        // Then
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.jsonPath().getList("data.items.representativeImageUrl", String.class))
                .containsExactlyInAnyOrder(
                        "https://service.example.test/api/images/groups/123/cover.webp",
                        "images/default-group.png",
                        "images/default-group.png");
        assertThat(authenticated(outsider).get("/chats").jsonPath().getList("data.items")).isEmpty();
    }

    @Test
    @DisplayName("선착순 가입과 승인 및 초대 수락은 가입 이전 이력을 읽음 기준으로 기록한다")
    void allJoiningApisInitializeReadBaseline() {
        Member owner = member("111");
        Member automatic = member("112");
        Member approved = member("113");
        Member invited = member("114");
        Group group = groups.save(Group.createClub("합류", "소개", null, null, null, NOW));
        groupMembers.save(GroupMember.createLeader(group, owner, NOW));
        String messages = "/groups/" + group.getId() + "/chat/messages";
        assertThat(
                        authenticated(owner)
                                .body(
                                        Map.of(
                                                "clientMessageId",
                                                UUID.randomUUID(),
                                                "content",
                                                "가입 전"))
                                .post(messages)
                                .statusCode())
                .isEqualTo(201);
        var autoRecruitment =
                recruitments.save(
                        GroupRecruitment.create(
                                group, JoinMethod.AUTO, 5, NOW.minusHours(1), NOW.plusDays(1)));
        assertThat(
                        authenticated(automatic)
                                .body(Map.of())
                                .post("/recruitments/" + autoRecruitment.getId() + "/registrations")
                                .statusCode())
                .isEqualTo(201);
        var approvalRecruitment =
                recruitments.save(
                        GroupRecruitment.create(
                                group, JoinMethod.APPROVAL, 5, NOW.minusHours(1), NOW.plusDays(1)));
        var registration =
                authenticated(approved)
                        .body(Map.of())
                        .post("/recruitments/" + approvalRecruitment.getId() + "/registrations");
        assertThat(registration.statusCode()).isEqualTo(201);
        assertThat(authenticated(approved).get(messages).statusCode()).isEqualTo(403);
        assertThat(
                        authenticated(owner)
                                .body(Map.of("status", "APPROVED"))
                                .patch(
                                        "/recruitments/"
                                                + approvalRecruitment.getId()
                                                + "/registrations/"
                                                + registration.jsonPath().getLong("data.id"))
                                .statusCode())
                .isEqualTo(200);
        var invitation =
                authenticated(owner)
                        .body(
                                Map.of(
                                        "type",
                                        "DIRECT",
                                        "targetMemberId",
                                        invited.getId(),
                                        "requestId",
                                        UUID.randomUUID()))
                        .post("/groups/" + group.getId() + "/invitations");
        assertThat(invitation.statusCode()).isEqualTo(201);
        assertThat(
                        authenticated(invited)
                                .body(Map.of())
                                .post(
                                        "/invitations/"
                                                + invitation.jsonPath().getLong("data.id")
                                                + "/acceptances")
                                .statusCode())
                .isEqualTo(201);
        for (Member joined : new Member[] {automatic, approved, invited}) {
            var history = authenticated(joined).get(messages);
            assertThat(history.jsonPath().getString("data.lastReadSequence")).isEqualTo("1");
            assertThat(history.jsonPath().getList("data.items")).hasSize(1);
            assertThat(
                            authenticated(joined)
                                    .get("/chats")
                                    .jsonPath()
                                    .getLong("data.items[0].unreadCount"))
                    .isZero();
            assertThat(
                            authenticated(joined)
                                    .body(Map.of("lastReadSequence", "0"))
                                    .put("/groups/" + group.getId() + "/chat/read")
                                    .jsonPath()
                                    .getString("data.lastReadSequence"))
                    .isEqualTo("1");
        }
    }

    @Test
    @DisplayName("소속 회원만 빈 방과 메시지를 조회하고 동일 요청은 한 번만 저장한다")
    void membersCanSendIdempotentlyAndReadEmptyRoom() {
        // Given
        Member owner = member("101");
        Member outsider = member("102");
        Group group = groups.save(Group.createClub("채팅", "소개", null, null, null, NOW));
        groupMembers.save(GroupMember.createLeader(group, owner, NOW));
        String path = "/groups/" + group.getId() + "/chat/messages";
        String key = UUID.randomUUID().toString();

        // When
        Response empty = authenticated(owner).get("/chats");
        Response first =
                authenticated(owner)
                        .body(Map.of("clientMessageId", key, "content", "안녕하세요"))
                        .post(path);
        Response retry =
                authenticated(owner)
                        .body(Map.of("clientMessageId", key, "content", "안녕하세요"))
                        .post(path);

        // Then
        assertThat(empty.statusCode()).isEqualTo(200);
        assertThat(empty.jsonPath().getList("data.items")).hasSize(1);
        assertThat(first.statusCode()).isEqualTo(201);
        assertThat(retry.statusCode()).isEqualTo(200);
        String avatar = "https://avatars.githubusercontent.com/u/101";
        assertThat(first.jsonPath().getString("data.avatarUrl")).isEqualTo(avatar);
        assertThat(retry.jsonPath().getString("data.avatarUrl")).isEqualTo(avatar);
        assertThat(authenticated(owner).get(path).jsonPath().getString("data.items[0].avatarUrl"))
                .isEqualTo(avatar);
        assertThat(authenticated(owner).get("/chats").jsonPath().getString("data.items[0].lastMessage.avatarUrl"))
                .isEqualTo(avatar);
        assertThat(first.jsonPath().getString("data.id"))
                .isEqualTo(retry.jsonPath().getString("data.id"));
        assertThat(
                        authenticated(owner)
                                .body(Map.of("clientMessageId", key, "content", "다른 내용"))
                                .post(path)
                                .statusCode())
                .isEqualTo(409);
        assertThat(authenticated(outsider).get(path).statusCode()).isEqualTo(403);
        assertThat(authenticated(owner).get(path).jsonPath().getList("data.items")).hasSize(1);
    }

    private RequestSpecification authenticated(Member member) {
        String token = tokens.issue(member.getId()).value();
        String csrf = given().cookie("accessToken", token).get("/members/me").cookie("XSRF-TOKEN");
        return given().cookie("accessToken", token)
                .cookie("XSRF-TOKEN", csrf)
                .header("X-XSRF-TOKEN", csrf)
                .contentType("application/json");
    }
}
