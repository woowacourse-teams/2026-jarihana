package com.project.jarihana.gomoku;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class GomokuChatDisabledTest extends IntegrationTestSupport {
    @Autowired MemberRepository members;
    @Autowired AccessTokenProvider tokens;

    @Test
    @DisplayName("기본 비활성 채팅은 회원에게 비활성 코드를 반환하고 비인증 요청은 거절한다")
    void disablesChatByDefault() {
        // Given
        String path = "/games/gomoku/rooms/1/chat/messages";
        String token = tokens.issue(members.save(Member.create("가온", 23, "chat-disabled", Course.BACKEND)).getId()).value();

        // When / Then
        given().cookie("accessToken", token).get(path).then().statusCode(404)
                .body("error.code", equalTo("GOMOKU_CHAT_DISABLED"));
        given().get(path).then().statusCode(401);
        given().cookie("accessToken", token).contentType("application/json").body("{}")
                .post(path).then().statusCode(403);
    }
}
