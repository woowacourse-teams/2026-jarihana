package com.project.jarihana.feedback.command.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class FeedbackCommandControllerTest extends IntegrationTestSupport {

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @DisplayName("로그인한 회원은 피드백을 작성하고 작성 회원과 함께 저장한다.")
    @Test
    void createsFeedbackForAuthenticatedMember() {
        // Given
        Member member = memberRepository.save(
                Member.create("가온", 23, "github-feedback-member", Course.BACKEND));
        String accessToken = accessTokenProvider.issue(member.getId()).value();
        String csrfToken = csrfToken();

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("""
                        {
                          "content": "피드백 저장 확인"
                        }
                        """)
                .when()
                .post("/feedbacks")
                .then()
                .statusCode(201)
                .body("success", equalTo(true));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT member_id FROM feedback WHERE content = ?", Long.class, "피드백 저장 확인"))
                .isEqualTo(member.getId());
    }

    @DisplayName("로그인하지 않은 사용자는 피드백을 작성할 수 없다.")
    @Test
    void rejectsFeedbackFromUnauthenticatedUser() {
        // Given
        String csrfToken = csrfToken();

        // When / Then
        given()
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("{\"content\":\"비회원 피드백 차단 확인\"}")
                .when()
                .post("/feedbacks")
                .then()
                .statusCode(401)
                .body("success", equalTo(false))
                .body("error.code", equalTo("UNAUTHENTICATED"));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM feedback WHERE content = ?", Long.class, "비회원 피드백 차단 확인"))
                .isZero();
    }

    private String csrfToken() {
        ExtractableResponse<Response> response = given()
                .when()
                .get("/groups?size=1")
                .then()
                .extract();
        return response.cookie("XSRF-TOKEN");
    }
}
