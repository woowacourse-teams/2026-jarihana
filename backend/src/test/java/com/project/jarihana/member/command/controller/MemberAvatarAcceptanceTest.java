package com.project.jarihana.member.command.controller;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

class MemberAvatarAcceptanceTest extends IntegrationTestSupport {
    private static final String PATH = "/members/me/avatar";
    private static final String BODY = """
            {"appearance":{"version":1,"hair":"flowing","skin":"tan","hairColor":"silver",
            "face":"oval","eyes":"slim","eyebrows":"bold","nose":"wide","mouth":"smile",
            "glasses":"square","outfit":"lilac","shoes":"highTop","shoeColor":"mint"}}
            """;

    @Autowired private MemberRepository members;
    @Autowired private AccessTokenProvider tokens;
    @Autowired private AuthCookieProperties cookies;
    @Autowired private JdbcTemplate jdbc;

    @Test
    @DisplayName("내 아바타 생성, 교체, 재조회와 삭제 후 기본형 복귀를 지원한다.")
    void savesReplacesAndDeletesOwnAvatar() {
        // Given
        Member member = members.save(Member.create("가온", 8, "avatar-owner", Course.BACKEND));
        request(member).get(PATH).then().statusCode(200)
                .body("data.customized", equalTo(false)).body("data.appearance.hair", equalTo("bald"));
        // When / Then
        request(member).body(BODY).put(PATH).then().statusCode(204);
        request(member).get(PATH).then().statusCode(200)
                .body("data.customized", equalTo(true)).body("data.appearance.hair", equalTo("flowing"))
                .body("data.appearance.shoes", equalTo("highTop"))
                .body("data.appearance.shoeColor", equalTo("mint"));
        request(member).body(BODY.replace("lilac", "navy")).put(PATH).then().statusCode(204);
        request(member).get(PATH).then().statusCode(200)
                .body("data.appearance.outfit", equalTo("navy"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM member_avatar", Long.class)).isEqualTo(1);
        request(member).delete(PATH).then().statusCode(204);
        request(member).delete(PATH).then().statusCode(204);
        request(member).get(PATH).then().statusCode(200)
                .body("data.customized", equalTo(false)).body("data.appearance.hair", equalTo("bald"))
                .body("data.appearance.glasses", equalTo("none"))
                .body("data.appearance.shoes", equalTo("sneakers"))
                .body("data.appearance.shoeColor", equalTo("white"));
    }

    @Test
    @DisplayName("신발 필드가 없는 이전 요청은 흰 운동화를 저장하며 잘못된 신발은 기존 조합을 보존한다.")
    void defaultsLegacyFootwearAndRejectsUnknownChoices() {
        // Given
        Member member = members.save(Member.create("가온", 8, "avatar-legacy-shoes", Course.BACKEND));
        String legacy = BODY.replace(",\"shoes\":\"highTop\",\"shoeColor\":\"mint\"", "");
        // When / Then
        request(member).body(legacy).put(PATH).then().statusCode(204);
        request(member).get(PATH).then()
                .body("data.appearance.shoes", equalTo("sneakers"))
                .body("data.appearance.shoeColor", equalTo("white"));
        String nullable = BODY.replace("\"shoes\":\"highTop\"", "\"shoes\":null")
                .replace("\"shoeColor\":\"mint\"", "\"shoeColor\":null");
        request(member).body(nullable).put(PATH).then().statusCode(204);
        request(member).get(PATH).then()
                .body("data.appearance.shoes", equalTo("sneakers"))
                .body("data.appearance.shoeColor", equalTo("white"));
        request(member).body(BODY.replace("highTop", "unknown")).put(PATH).then().statusCode(400);
        request(member).body(BODY.replace("\"shoeColor\":\"mint\"", "\"shoeColor\":\"unknown\""))
                .put(PATH).then().statusCode(400);
        request(member).get(PATH).then()
                .body("data.appearance.shoes", equalTo("sneakers"))
                .body("data.appearance.shoeColor", equalTo("white"));
    }

    @Test
    @DisplayName("아바타는 계정별로 분리하며 잘못된 파츠 요청은 저장된 모습을 보존한다.")
    void isolatesMembersAndPreservesSavedAvatarAfterInvalidRequest() {
        // Given
        Member owner = members.save(Member.create("가온", 8, "avatar-one", Course.BACKEND));
        Member other = members.save(Member.create("도담", 8, "avatar-two", Course.FRONTEND));
        request(owner).body(BODY).put(PATH).then().statusCode(204);
        // When / Then
        request(other).get(PATH).then().body("data.customized", equalTo(false));
        request(other).delete(PATH).then().statusCode(204);
        request(owner).body(BODY.replace("flowing", "invalid")).put(PATH).then().statusCode(400)
                .body("error.code", equalTo("INVALID_PARAMETER"));
        request(owner).body("{}").put(PATH).then().statusCode(400);
        request(owner).get(PATH).then().body("data.appearance.hair", equalTo("flowing"));
    }

    @Test
    @DisplayName("모자와 선글라스를 함께 저장하고 잘못된 장신구 요청은 기존 조합을 보존한다.")
    void savesHatsWithSunglassesAndPreservesAccessoriesAfterInvalidRequest() {
        // Given
        Member member = members.save(Member.create("가온", 8, "avatar-accessories", Course.BACKEND));
        String accessories = BODY.replace("\"glasses\":\"square\"", "\"glasses\":\"sunglasses\"")
                .replace("\"shoeColor\":\"mint\"", "\"shoeColor\":\"mint\",\"hat\":\"cap\",\"hatColor\":\"coral\"");
        // When / Then
        for (String hat : new String[]{"cap", "bucket", "beanie", "beret"}) {
            request(member).body(accessories.replace("\"cap\"", "\"" + hat + "\""))
                    .put(PATH).then().statusCode(204);
            request(member).get(PATH).then()
                    .body("data.appearance.hat", equalTo(hat))
                    .body("data.appearance.hatColor", equalTo("coral"))
                    .body("data.appearance.glasses", equalTo("sunglasses"))
                    .body("data.appearance.hair", equalTo("flowing"))
                    .body("data.appearance.shoes", equalTo("highTop"));
        }
        request(member).body(accessories.replace("\"cap\"", "\"unknown\""))
                .put(PATH).then().statusCode(400);
        request(member).body(accessories.replace("\"hatColor\":\"coral\"", "\"hatColor\":\"unknown\""))
                .put(PATH).then().statusCode(400);
        request(member).get(PATH).then().body("data.appearance.hat", equalTo("beret"));
        request(member).body(BODY).put(PATH).then().statusCode(204);
        request(member).get(PATH).then()
                .body("data.appearance.hat", equalTo("none"))
                .body("data.appearance.hatColor", equalTo("ink"));
        String nullable = BODY.replace("\"shoeColor\":\"mint\"", "\"shoeColor\":\"mint\",\"hat\":null,\"hatColor\":null");
        request(member).body(nullable).put(PATH).then().statusCode(204);
        request(member).get(PATH).then().body("data.appearance.hat", equalTo("none"))
                .body("data.appearance.hatColor", equalTo("ink"));
        request(member).delete(PATH).then().statusCode(204);
        request(member).get(PATH).then().body("data.appearance.hat", equalTo("none"))
                .body("data.appearance.glasses", equalTo("none"));
    }

    @Test
    @DisplayName("가방을 모자·신발과 독립적으로 저장하고 잘못된 요청 뒤에도 기존 가방을 보존한다.")
    void savesBagsAndPreservesOtherPartsAndLegacyDefaults() {
        // Given
        Member member = members.save(Member.create("가온", 8, "avatar-bags", Course.BACKEND));
        String custom = BODY.replace("\"shoeColor\":\"mint\"", "\"shoeColor\":\"mint\",\"bag\":\"backpack\",\"bagColor\":\"coral\"");
        // When / Then
        for (String bag : new String[]{"backpack", "crossbody", "shoulder"}) {
            request(member).body(custom.replace("\"backpack\"", "\"" + bag + "\""))
                    .put(PATH).then().statusCode(204);
            request(member).get(PATH).then().body("data.appearance.bag", equalTo(bag))
                    .body("data.appearance.bagColor", equalTo("coral"))
                    .body("data.appearance.shoes", equalTo("highTop"))
                    .body("data.appearance.hair", equalTo("flowing"));
        }
        request(member).body(custom.replace("\"backpack\"", "\"unknown\""))
                .put(PATH).then().statusCode(400);
        request(member).body(custom.replace("\"bagColor\":\"coral\"", "\"bagColor\":\"unknown\""))
                .put(PATH).then().statusCode(400);
        request(member).get(PATH).then().body("data.appearance.bag", equalTo("shoulder"));
        request(member).body(BODY).put(PATH).then().statusCode(204);
        request(member).get(PATH).then().body("data.appearance.bag", equalTo("none"))
                .body("data.appearance.bagColor", equalTo("ink"));
        request(member).delete(PATH).then().statusCode(204);
        request(member).get(PATH).then().body("data.appearance.bag", equalTo("none"));
    }

    @Test
    @DisplayName("다섯 소지품을 가방과 함께 저장하며 잘못된 값은 거부하고 삭제하면 빈손으로 돌아간다.")
    void savesHandheldItemsWithBagAndRestoresEmptyHandsAfterDeletion() {
        // Given
        Member member = members.save(Member.create("가온", 8, "avatar-held-items", Course.BACKEND));
        String custom = BODY.replace("\"shoeColor\":\"mint\"", "\"shoeColor\":\"mint\",\"bag\":\"backpack\",\"bagColor\":\"navy\",\"handheld\":\"hotCoffee\"");
        // When / Then
        for (String item : new String[]{"hotCoffee", "icedCoffee", "book", "laptop", "phone"}) {
            request(member).body(custom.replace("\"hotCoffee\"", "\"" + item + "\""))
                    .put(PATH).then().statusCode(204);
            request(member).get(PATH).then().body("data.appearance.handheld", equalTo(item))
                    .body("data.appearance.bag", equalTo("backpack"));
        }
        request(member).body(custom.replace("\"hotCoffee\"", "\"unknown\""))
                .put(PATH).then().statusCode(400);
        request(member).get(PATH).then().body("data.appearance.handheld", equalTo("phone"));
        request(member).body(BODY).put(PATH).then().statusCode(204);
        request(member).get(PATH).then().body("data.appearance.handheld", equalTo("none"));
        String nullable = BODY.replace("\"shoeColor\":\"mint\"", "\"shoeColor\":\"mint\",\"bag\":null,\"bagColor\":null,\"handheld\":null");
        request(member).body(nullable).put(PATH).then().statusCode(204);
        request(member).get(PATH).then().body("data.appearance.bag", equalTo("none"))
                .body("data.appearance.bagColor", equalTo("ink"))
                .body("data.appearance.handheld", equalTo("none"));
        request(member).delete(PATH).then().statusCode(204);
        request(member).get(PATH).then().body("data.appearance.handheld", equalTo("none"))
                .body("data.appearance.bag", equalTo("none"));
    }

    @Test
    @DisplayName("인증되지 않은 조회와 변경 및 CSRF 토큰 없는 변경을 거부한다.")
    void requiresAuthenticationAndCsrf() {
        // Given
        Member member = members.save(Member.create("가온", 8, "avatar-security", Course.BACKEND));
        String csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        // When / Then
        given().get(PATH).then().statusCode(401);
        given().cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json").body(BODY).put(PATH).then().statusCode(401);
        given().cookie(cookies.accessTokenName(), tokens.issue(member.getId()).value())
                .contentType("application/json").body(BODY).put(PATH).then().statusCode(403);
        requestMissingMember().get(PATH).then().statusCode(401);
    }

    private RequestSpecification request(Member member) {
        String csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        return given().cookie(cookies.accessTokenName(), tokens.issue(member.getId()).value())
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf).contentType("application/json");
    }

    private RequestSpecification requestMissingMember() {
        return given().cookie(cookies.accessTokenName(), tokens.issue(999_999L).value());
    }
}
