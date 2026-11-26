package com.project.jarihana.member.query.controller;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberAffiliationRepository;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Affiliation;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.RestAssured;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static com.project.jarihana.support.TestSupportConfig.FIXED_NOW;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.equalTo;

class MemberAffiliationQueryAcceptanceTest extends IntegrationTestSupport {

    @Autowired private MemberRepository members;
    @Autowired private MemberAffiliationRepository memberAffiliations;
    @Autowired private AccessTokenProvider accessTokens;
    @Autowired private AuthCookieProperties cookies;

    @DisplayName("회원은 자신이 확인된 소속 목록을 조회하고, 소속이 없으면 빈 목록을 받는다.")
    @Test
    void findMyAffiliations() {
        // Given
        Member crew = members.save(Member.create("가온", 8, "affiliation-crew", Course.BACKEND));
        Member basic = members.save(Member.createBasic("나래", "affiliation-basic"));
        memberAffiliations.insertIfAbsent(crew.getId(), Affiliation.WOOTECO_CODE, FIXED_NOW);

        // When & Then
        RestAssured.given().cookie(cookies.accessTokenName(), accessTokens.issue(crew.getId()).value())
                .get("/members/me/affiliations").then().statusCode(200)
                .body("data.name", contains("우아한테크코스"));
        RestAssured.given().cookie(cookies.accessTokenName(), accessTokens.issue(basic.getId()).value())
                .get("/members/me/affiliations").then().statusCode(200)
                .body("data", empty());
    }

    @DisplayName("로그인하지 않으면 소속 목록을 조회할 수 없다.")
    @Test
    void rejectsAnonymous() {
        // When & Then
        RestAssured.given().get("/members/me/affiliations").then().statusCode(401)
                .body("success", equalTo(false));
    }
}
