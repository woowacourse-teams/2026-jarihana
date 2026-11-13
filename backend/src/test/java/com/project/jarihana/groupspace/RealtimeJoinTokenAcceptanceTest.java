package com.project.jarihana.groupspace;

import static com.project.jarihana.support.TestSupportConfig.FIXED_NOW;
import static com.project.jarihana.support.TestSupportConfig.ZONE;
import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.domain.SessionGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import io.restassured.specification.RequestSpecification;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Base64;
import java.util.Date;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

class RealtimeJoinTokenAcceptanceTest extends IntegrationTestSupport {
    private static final String TOKEN_KEY = "_80NtQkcKD9mw_CffGhAjISOdxrCz12QRrG9H_n7TJs";
    private static final long NOW = FIXED_NOW.atZone(ZONE).toInstant().toEpochMilli();

    @Autowired MemberRepository members;
    @Autowired GroupJpaRepository groups;
    @Autowired GroupMemberJpaRepository memberships;
    @Autowired AccessTokenProvider tokens;
    @Autowired AuthCookieProperties cookies;
    @Autowired JdbcTemplate jdbc;
    private Member leader;
    private Member visitor;
    private Group group;
    private String csrf;

    @DynamicPropertySource
    static void realtimeProperties(DynamicPropertyRegistry properties) {
        properties.add("jarihana.realtime.websocket-url", () -> "wss://realtime.example.test/ws/realtime");
    }

    @BeforeEach
    void fixtures() {
        leader = members.save(Member.create("리더", 8, "realtime-leader", Course.BACKEND));
        visitor = members.save(Member.create("방문", 8, "realtime-visitor", Course.FRONTEND));
        group = groups.save(Group.createStudy("멀티플레이 모임", "함께 놀아요", null, null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.MONDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)), FIXED_NOW));
        memberships.save(GroupMember.createLeader(group, leader, FIXED_NOW));
        csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
    }

    @Test
    @DisplayName("입장 토큰은 현재 회원과 방에 한정된 60초 HS256 서명이다")
    void issuesRoomScopedTokenWithSixtySecondLifetime() {
        // Given
        var request = memberRequest(visitor);

        // When
        var response = request.post(tokenPath()).then().statusCode(200)
                .header("Cache-Control", "no-store").extract().response();
        String token = response.jsonPath().getString("data.token");
        var key = Keys.hmacShaKeyFor(Base64.getUrlDecoder().decode(TOKEN_KEY));
        var signed = Jwts.parser().verifyWith(key)
                .clock(() -> new Date(NOW)).build().parseSignedClaims(token);

        // Then
        assertThat(signed.getHeader().getAlgorithm()).isEqualTo("HS256");
        assertThat(signed.getPayload().getSubject()).isEqualTo(visitor.getId().toString());
        assertThat(signed.getPayload().get("roomId", String.class)).isEqualTo(group.getId().toString());
        assertThat(signed.getPayload().getIssuer()).isEqualTo("jarihana-api-dev");
        assertThat(signed.getPayload().getAudience()).containsExactly("jarihana-realtime");
        assertThat(signed.getPayload().getId()).isNotBlank();
        assertThat(signed.getPayload().getIssuedAt().getTime()).isEqualTo(NOW);
        assertThat(signed.getPayload().getExpiration().getTime()).isEqualTo(NOW + 60_000);
        assertThat(response.jsonPath().getLong("data.expiresAt")).isEqualTo(NOW + 60_000);
        assertThat(response.jsonPath().getString("data.websocketUrl"))
                .isEqualTo("wss://realtime.example.test/ws/realtime");
    }

    @Test
    @DisplayName("입장 토큰에는 회원 인증과 CSRF 검증이 모두 필요하다")
    void tokenRequiresMemberAndCsrf() {
        // Given / When / Then
        given().cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .post(tokenPath()).then().statusCode(401);
        given().cookie(cookies.accessTokenName(), tokens.issue(visitor.getId()).value())
                .post(tokenPath()).then().statusCode(403);
    }

    @Test
    @DisplayName("탈퇴 회원과 종료된 모임은 입장 토큰을 발급하지 않는다")
    void doesNotIssueTokenForWithdrawnMemberOrEndedRoom() {
        // Given
        jdbc.update("UPDATE member SET withdrawn_at = ? WHERE id = ?", FIXED_NOW, visitor.getId());

        // When / Then
        memberRequest(visitor).post(tokenPath()).then().statusCode(403);
        groups.save(groups.findById(group.getId()).orElseThrow().endAt(FIXED_NOW.plusDays(2)));
        memberRequest(leader).post(tokenPath()).then().statusCode(409).body("error.code", equalTo("GROUP_ENDED"));
    }

    @Test
    @DisplayName("같이해요 유형은 입장 토큰을 발급하지 않는다")
    void sessionGroupDoesNotIssueJoinToken() {
        // Given
        Group session = groups.save(Group.createSession("일회 모임", "함께 만나요", null, null,
                SessionGroupSchedule.of(FIXED_NOW.toLocalDate().plusDays(1), LocalTime.of(19, 0), LocalTime.of(21, 0)), FIXED_NOW));

        // When / Then
        memberRequest(visitor).post("/groups/" + session.getId() + "/space/join-token")
                .then().statusCode(404).body("error.code", equalTo("GROUP_SPACE_NOT_AVAILABLE"));
    }

    private RequestSpecification memberRequest(Member member) {
        return given().cookie(cookies.accessTokenName(), tokens.issue(member.getId()).value())
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf).contentType("application/json");
    }

    private String tokenPath() {
        return "/groups/" + group.getId() + "/space/join-token";
    }

}
