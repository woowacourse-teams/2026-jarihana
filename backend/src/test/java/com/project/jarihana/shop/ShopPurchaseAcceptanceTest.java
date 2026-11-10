package com.project.jarihana.shop;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

@TestPropertySource(properties = "jarihana.shop.enabled=true")
class ShopPurchaseAcceptanceTest extends IntegrationTestSupport {
    private static final String PATH = "/members/me/shop/purchases";
    private static final String PRODUCT = """
            {"name":"테스트 모자","description":"구매 계약 검증용","categoryId":"wear","price":300,
             "preview":{"type":"avatar","art":"beanie","tone":"rose",
                        "appearance":{"hat":"beanie","hatColor":"coral"}},
             "grant":{"itemId":"test-beanie","slot":"hat"}}
            """;
    @Autowired private MemberRepository members;
    @Autowired private AccessTokenProvider tokens;
    @Autowired private AuthCookieProperties cookies;
    @Autowired private JdbcTemplate jdbc;

    @Test
    @DisplayName("구매는 잔액 차감과 영구 보유를 함께 저장하고 응답 유실 재시도는 중복 차감하지 않는다.")
    void purchasesOnceAndReplaysAfterTermsChange() {
        // Given
        Member member = member("가온", "shop-one", 1000);
        String version = offer("beanie", PRODUCT);
        Map<String, Object> body = body(member.getId(), "beanie", version);
        // When
        Response first = request(member).body(body).post(PATH);
        first.then().statusCode(201).body("data.wallet.balance", equalTo(700))
                .body("data.inventory.items[0].itemId", equalTo("test-beanie"));
        jdbc.update("UPDATE shop_product SET available = false WHERE id = 'beanie'");
        // Then: an already completed request remains recoverable after the offer changes.
        request(member).body(body).post(PATH).then().statusCode(201)
                .body("data.purchaseId", equalTo(first.jsonPath().getString("data.purchaseId")))
                .body("data.wallet.balance", equalTo(700));
        request(member).get("/members/me/shop").then().statusCode(200)
                .body("data.inventory.items.size()", equalTo(1));
        request(member).get("/members/me/points").then().statusCode(200)
                .body("data.balance", equalTo(700));
        assertThat(balance(member)).isEqualTo(700);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM shop_purchase", Long.class)).isEqualTo(1);
        request(member).body(Map.of("productId", "another", "termsVersion", version,
                "requestId", body.get("requestId"), "expectedMemberId", member.getId())).post(PATH).then().statusCode(409)
                .body("error.code", equalTo("REQUEST_CONFLICT"));
    }

    @Test
    @DisplayName("다른 요청 키로 같은 아이템을 재구매할 수 없고 다른 회원은 별도로 구매한다.")
    void preventsDuplicateOwnershipAndIsolatesMembers() {
        // Given
        Member first = member("가온", "shop-first", 1000);
        Member second = member("도담", "shop-second", 1000);
        String version = offer("beanie", PRODUCT);
        // When / Then
        request(first).body(body(first.getId(), "beanie", version)).post(PATH).then().statusCode(201);
        request(first).body(body(first.getId(), "beanie", version)).post(PATH).then().statusCode(409)
                .body("error.code", equalTo("ALREADY_OWNED"));
        request(second).get("/members/me/shop").then().body("data.inventory.items.size()", equalTo(0));
        request(second).body(body(second.getId(), "beanie", version)).post(PATH).then().statusCode(201);
        assertThat(balance(first)).isEqualTo(700);
        assertThat(balance(second)).isEqualTo(700);
    }

    @Test
    @DisplayName("다른 계정으로 바뀐 탭의 구매를 거절하고 두 계정의 잔액과 보유를 보존한다.")
    void rejectsPurchaseConfirmedForAnotherAccount() {
        // Given
        Member confirmedMember = member("가온", "shop-confirmed", 1000);
        Member cookieMember = member("도담", "shop-cookie", 900);
        String version = offer("beanie", PRODUCT);

        // When
        request(cookieMember).body(body(confirmedMember.getId(), "beanie", version)).post(PATH)
                .then().statusCode(409).body("error.code", equalTo("ACCOUNT_CHANGED"));

        // Then
        request(confirmedMember).get("/members/me/shop").then().statusCode(200)
                .body("data.wallet.balance", equalTo(1000)).body("data.inventory.items.size()", equalTo(0));
        request(cookieMember).get("/members/me/shop").then().statusCode(200)
                .body("data.wallet.balance", equalTo(900)).body("data.inventory.items.size()", equalTo(0));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM shop_purchase", Long.class)).isZero();
    }

    @Test
    @DisplayName("잔액 부족, 변경된 조건, 판매 종료와 잘못된 요청은 잔액과 보유를 변경하지 않는다.")
    void rejectsInvalidPurchasesWithoutDebit() {
        // Given
        Member member = member("가온", "shop-invalid", 200);
        String version = offer("beanie", PRODUCT);
        // When / Then
        request(member).body(body(member.getId(), "beanie", version)).post(PATH).then().statusCode(409)
                .body("error.code", equalTo("INSUFFICIENT_POINTS"));
        request(member).body(body(member.getId(), "beanie", "stale")).post(PATH).then().statusCode(409)
                .body("error.code", equalTo("TERMS_CHANGED"));
        request(member).body(Map.of("productId", "beanie", "termsVersion", version, "requestId", "invalid",
                "expectedMemberId", member.getId()))
                .post(PATH).then().statusCode(400);
        request(member).body(Map.of("productId", "beanie", "termsVersion", version,
                "requestId", UUID.randomUUID().toString())).post(PATH).then().statusCode(400);
        jdbc.update("UPDATE shop_product SET available = false");
        request(member).body(body(member.getId(), "beanie", version)).post(PATH).then().statusCode(409)
                .body("error.code", equalTo("PRODUCT_UNAVAILABLE"));
        assertThat(balance(member)).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM shop_purchase", Long.class)).isZero();
    }

    @Test
    @DisplayName("동시에 서로 다른 상품을 구매해도 잔액을 초과하여 사용할 수 없다.")
    void serializesConcurrentPurchases() throws Exception {
        // Given
        Member member = member("가온", "shop-concurrent", 400);
        String first = offer("beanie", PRODUCT);
        String second = offer("bucket", PRODUCT.replace("test-beanie", "test-bucket"));
        Callable<Integer> buyFirst = () -> request(member).body(body(member.getId(), "beanie", first)).post(PATH).statusCode();
        Callable<Integer> buySecond = () -> request(member).body(body(member.getId(), "bucket", second)).post(PATH).statusCode();
        // When
        try (var executor = Executors.newFixedThreadPool(2)) {
            var results = executor.invokeAll(List.of(buyFirst, buySecond));
            // Then
            assertThat(List.of(results.get(0).get(), results.get(1).get())).containsExactlyInAnyOrder(201, 409);
        }
        assertThat(balance(member)).isEqualTo(100);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM shop_purchase", Long.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("동일 요청의 동시 재전송은 한 번만 차감하고 같은 구매 번호를 돌려준다.")
    void serializesSameRequest() throws Exception {
        // Given
        Member member = member("가온", "shop-retry", 1000);
        Map<String, Object> body = body(member.getId(), "beanie", offer("beanie", PRODUCT));
        Callable<Response> buy = () -> request(member).body(body).post(PATH);
        // When
        try (var executor = Executors.newFixedThreadPool(2)) {
            var results = executor.invokeAll(List.of(buy, buy));
            // Then
            results.get(0).get().then().statusCode(201);
            results.get(1).get().then().statusCode(201);
            assertThat(results.get(0).get().jsonPath().getString("data.purchaseId"))
                    .isEqualTo(results.get(1).get().jsonPath().getString("data.purchaseId"));
        }
        assertThat(balance(member)).isEqualTo(700);
    }

    @Test
    @DisplayName("인증과 CSRF 없이 구매할 수 없고 클라이언트가 보낸 가격은 차감 기준이 아니다.")
    void requiresAuthenticationAndCsrfAndUsesServerPrice() {
        // Given
        Member member = member("가온", "shop-auth", 1000);
        String version = offer("beanie", PRODUCT);
        String csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        // When / Then
        given().get("/members/me/shop").then().statusCode(401);
        given().cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json").body(body(member.getId(), "beanie", version)).post(PATH).then().statusCode(401);
        given().cookie(cookies.accessTokenName(), tokens.issue(member.getId()).value())
                .contentType("application/json").body(body(member.getId(), "beanie", version)).post(PATH).then().statusCode(403);
        request(member).body(Map.of("productId", "beanie", "termsVersion", version,
                "requestId", UUID.randomUUID().toString(), "expectedMemberId", member.getId(),
                "price", 1, "memberId", 999)).post(PATH)
                .then().statusCode(201).body("data.wallet.balance", equalTo(700));
    }

    @Test
    @DisplayName("아이템 지급 기록 저장에 실패하면 앞서 차감한 포인트도 롤백한다.")
    void rollsBackDebitWhenGrantFails() {
        // Given
        Member member = member("가온", "shop-rollback", 1000);
        String version = offer("beanie", PRODUCT);
        jdbc.execute("ALTER TABLE shop_purchase ADD CONSTRAINT shop_test_failure CHECK (amount <> 300)");
        try {
            // When
            request(member).body(body(member.getId(), "beanie", version)).post(PATH).then().statusCode(500);
            // Then
            assertThat(balance(member)).isEqualTo(1000);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM shop_purchase", Long.class)).isZero();
        } finally {
            jdbc.execute("ALTER TABLE shop_purchase DROP CONSTRAINT shop_test_failure");
        }
    }

    @Test
    @DisplayName("적립과 구매가 동시에 일어나도 완료된 적립액과 구매액을 모두 잔액에 반영한다.")
    void preservesConcurrentRewardCredit() throws Exception {
        // Given: the same additive wallet update used by #589's complete method.
        Member member = member("가온", "shop-credit", 1000);
        String version = offer("beanie", PRODUCT);
        Callable<Integer> buy = () -> request(member).body(body(member.getId(), "beanie", version)).post(PATH).statusCode();
        Callable<Integer> credit = () -> jdbc.update("UPDATE point_wallet SET balance = balance + 25 WHERE member_id = ?", member.getId());
        // When
        try (var executor = Executors.newFixedThreadPool(2)) {
            var results = executor.invokeAll(List.of(buy, credit));
            // Then
            assertThat(results.get(0).get()).isEqualTo(201);
            assertThat(results.get(1).get()).isEqualTo(1);
        }
        assertThat(balance(member)).isEqualTo(725);
    }

    @Test
    @DisplayName("사라진 회원의 토큰으로 조회하거나 구매할 수 없다.")
    void rejectsMissingMember() {
        // Given
        String version = offer("beanie", PRODUCT);
        String csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        // When / Then
        given().cookie(cookies.accessTokenName(), tokens.issue(999999L).value())
                .get("/members/me/shop").then().statusCode(401);
        given().cookie(cookies.accessTokenName(), tokens.issue(999999L).value())
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json").body(body(999999L, "beanie", version)).post(PATH).then().statusCode(401);
    }

    @Test
    @DisplayName("보유한 프로필 장식을 슬롯별로 교체하고 해제한다")
    void equipsOnlyOwnedProfileItems() {
        // Given
        Member buyer = member("가온", "shop-profile-buyer", 900);
        Member other = member("다온", "shop-profile-other", 900);
        String frame = PRODUCT.replace("\"wear\"", "\"profile\"")
                .replace("\"avatar\"", "\"profile\"").replace("\"hat\"", "\"frame\"");
        String first = offer("profile-first", frame.replace("test-beanie", "test-first"));
        String second = offer("profile-second", frame.replace("test-beanie", "test-second"));
        String equipment = "/members/me/shop/equipment";
        var equipFirst = Map.of("itemId", "test-first", "equipped", true);
        request(buyer).body(body(buyer.getId(), "profile-first", first)).post(PATH).then().statusCode(201);
        request(buyer).body(body(buyer.getId(), "profile-second", second)).post(PATH).then().statusCode(201);

        // When / Then
        request(other).body(equipFirst).put(equipment).then().statusCode(409)
                .body("error.code", equalTo("ITEM_NOT_OWNED"));
        request(buyer).body(equipFirst).put(equipment).then().statusCode(200)
                .body("data.equipped.frame", equalTo("test-first"));
        request(buyer).body(Map.of("itemId", "test-second", "equipped", true)).put(equipment)
                .then().statusCode(200).body("data.equipped.frame", equalTo("test-second"));
        request(buyer).body(Map.of("itemId", "test-first", "equipped", false)).put(equipment)
                .then().statusCode(200).body("data.equipped.frame", equalTo("test-second"));
        request(buyer).get(equipment).then().statusCode(200).body("data[0].itemId", equalTo("test-second"));
        request(other).get(equipment).then().statusCode(200).body("data.size()", equalTo(0));
        request(buyer).get("/members/me/shop").then().statusCode(200)
                .body("data.inventory.equipped.frame", equalTo("test-second"));
        request(buyer).body(Map.of("itemId", "test-second", "equipped", false)).put(equipment)
                .then().statusCode(200).body("data.equipped.size()", equalTo(0));
        assertThat(balance(buyer)).isEqualTo(300);
    }

    private Member member(String name, String github, long balance) {
        Member member = members.save(Member.create(name, 8, github, Course.BACKEND));
        jdbc.update("INSERT INTO point_wallet(member_id, balance) VALUES (?, ?)", member.getId(), balance);
        return member;
    }

    private String offer(String id, String definition) {
        jdbc.update("INSERT INTO shop_product(id, definition, available) VALUES (?, ?::jsonb, true)", id, definition);
        return given().get("/shop/products").then().statusCode(200).extract().jsonPath()
                .getString("data.products.find { it.id == '" + id + "' }.termsVersion");
    }

    private Map<String, Object> body(long memberId, String productId, String version) {
        return Map.of("productId", productId, "termsVersion", version, "requestId", UUID.randomUUID().toString(),
                "expectedMemberId", memberId);
    }

    private long balance(Member member) {
        return jdbc.queryForObject("SELECT balance FROM point_wallet WHERE member_id = ?", Long.class, member.getId());
    }

    private RequestSpecification request(Member member) {
        String csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        return given().cookie(cookies.accessTokenName(), tokens.issue(member.getId()).value())
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf).contentType("application/json");
    }
}
