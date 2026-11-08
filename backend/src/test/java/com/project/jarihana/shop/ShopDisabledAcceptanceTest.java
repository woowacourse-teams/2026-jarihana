package com.project.jarihana.shop;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

class ShopDisabledAcceptanceTest extends IntegrationTestSupport {
    @Autowired private MemberRepository members;
    @Autowired private AccessTokenProvider tokens;
    @Autowired private AuthCookieProperties cookies;

    @Test
    @DisplayName("판매 설정이 없으면 상품을 판매하지 않고 인증된 구매도 거절한다.")
    void disablesPurchasesByDefault() {
        // Given
        Member member = members.save(Member.create("가온", 8, "shop-disabled", Course.BACKEND));
        String csrf = given().get("/shop/products").then().statusCode(200)
                .body("data.purchasingEnabled", equalTo(false)).body("data.products.size()", equalTo(0))
                .extract().cookie("XSRF-TOKEN");
        // When / Then
        given().cookie(cookies.accessTokenName(), tokens.issue(member.getId()).value())
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf).contentType("application/json")
                .body("{\"productId\":\"beanie\",\"termsVersion\":\"v1\",\"requestId\":\"00000000-0000-0000-0000-000000000001\"}")
                .post("/members/me/shop/purchases").then().statusCode(503)
                .body("error.code", equalTo("SHOP_UNAVAILABLE"));
    }
}
