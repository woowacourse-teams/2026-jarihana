package com.project.jarihana.pushsubscription;

import com.project.jarihana.auth.command.repository.RefreshTokenRepository;
import com.project.jarihana.auth.command.service.RefreshTokenHasher;
import com.project.jarihana.auth.command.service.RefreshTokenIssuer;
import com.project.jarihana.auth.config.JwtProperties;
import com.project.jarihana.auth.domain.RefreshToken;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import com.project.jarihana.pushsubscription.support.PushIntegrationTestSupport;
import io.restassured.RestAssured;
import io.restassured.response.Response;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import java.time.Clock;
import java.time.ZoneId;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class PushLogoutAcceptanceTest extends PushIntegrationTestSupport {
    @Autowired private RefreshTokenIssuer issuer;
    @Autowired private RefreshTokenRepository refreshTokens;
    @Autowired private RefreshTokenHasher hasher;
    @Autowired private JwtProperties jwtProperties;
    @Autowired private NotificationDeliveryCommandRepository deliveries;

    @Test
    @DisplayName("로그아웃은 현재 구독과 대기 작업만 해제하며 다른 브라우저는 유지한다.")
    void logoutDisconnectsCurrentBrowser() {
        // Given
        Member owner = member("101");
        var current = subscription(owner, "current");
        var other = subscription(owner, "other");
        var notification = notification(owner, "event");
        var pending = deliveries.save(NotificationDelivery.create(notification, current, NOW, NOW.plusDays(1)));
        var untouched = deliveries.save(NotificationDelivery.create(notification, other, NOW, NOW.plusDays(1)));
        String refresh = issuer.issue(owner).value();
        // When
        Response response = mutation(owner).cookie(cookies.refreshTokenName(), refresh).contentType("application/json")
                .body(Map.of("pushSubscriptionId", current.getId(), "generation", current.getGeneration())).post("/auth/logout");
        // Then
        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(refreshTokens.findByTokenHash(hasher.hash(refresh))).isEmpty();
        assertThat(subscriptions.findByIdAndMemberId(current.getId(), owner.getId()).orElseThrow().isEnabled()).isFalse();
        assertThat(subscriptions.findByIdAndMemberId(other.getId(), owner.getId()).orElseThrow().isEnabled()).isTrue();
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.CANCELLED);
        assertThat(deliveries.findById(untouched.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.PENDING);
        assertThat(response.detailedCookie(cookies.accessTokenName()).getMaxAge()).isZero();
    }

    @Test
    @DisplayName("만료된 Access Token과 기존 만료 Refresh Token만 있어도 기존 로그아웃 의미대로 연결을 해제한다.")
    void expiredAccessUsesStoredRefreshOwner() {
        // Given
        Member owner = member("101");
        var current = subscription(owner, "current");
        String raw = "expired-stored-refresh";
        refreshTokens.save(RefreshToken.issue(owner, hasher.hash(raw), NOW.minusDays(1)));
        Clock earlier = Clock.fixed(NOW.minusHours(2).atZone(ZoneId.of("Asia/Seoul")).toInstant(), ZoneId.of("Asia/Seoul"));
        String expiredAccess = new AccessTokenProvider(jwtProperties, earlier).issue(owner.getId()).value();
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");
        // When
        Response response = RestAssured.given().cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .cookie(cookies.accessTokenName(), expiredAccess).cookie(cookies.refreshTokenName(), raw)
                .contentType("application/json").body(Map.of("pushSubscriptionId", current.getId(), "generation", 1)).post("/auth/logout");
        // Then
        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(refreshTokens.findByTokenHash(hasher.hash(raw))).isEmpty();
        assertThat(subscriptions.findByIdAndMemberId(current.getId(), owner.getId()).orElseThrow().isEnabled()).isFalse();
    }

    @Test
    void deliveryCancellationFailureRollsBackBindingAndRefreshRevocation() {
        // Given
        Member owner = member("101");
        var current = subscription(owner, "current");
        var pending = deliveries.save(NotificationDelivery.create(notification(owner, "event"), current, NOW, NOW.plusDays(1)));
        String refresh = issuer.issue(owner).value();
        jdbc.execute("""
                create function fail_push_cancellation() returns trigger language plpgsql as $$
                begin raise exception 'forced cancellation failure'; end $$
                """);
        jdbc.execute("create trigger fail_push_cancellation before update on notification_deliveries for each row execute function fail_push_cancellation()");
        try {
            // When
            Response response = mutation(owner).cookie(cookies.refreshTokenName(), refresh).contentType("application/json")
                    .body(Map.of("pushSubscriptionId", current.getId(), "generation", 1)).post("/auth/logout");
            // Then
            assertThat(response.statusCode()).isEqualTo(500);
            assertThat(refreshTokens.findByTokenHash(hasher.hash(refresh))).isPresent();
            var unchanged = subscriptions.findByEndpoint(current.getEndpoint()).orElseThrow();
            assertThat(unchanged.isEnabled()).isTrue();
            assertThat(unchanged.getGeneration()).isEqualTo(1);
            assertThat(deliveries.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.PENDING);
            assertThat(response.detailedCookie(cookies.accessTokenName())).isNull();
        } finally {
            jdbc.execute("drop trigger fail_push_cancellation on notification_deliveries");
            jdbc.execute("drop function fail_push_cancellation()");
        }
    }

    @Test
    void mixedAccountCredentialsCannotDisconnectEitherAccount() {
        // Given
        Member owner = member("101");
        Member other = member("102");
        var current = subscription(owner, "one");
        String refresh = issuer.issue(other).value();
        // When
        Response response = mutation(owner).cookie(cookies.refreshTokenName(), refresh).contentType("application/json")
                .body(Map.of("pushSubscriptionId", current.getId(), "generation", 1)).post("/auth/logout");
        // Then
        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(refreshTokens.findByTokenHash(hasher.hash(refresh))).isPresent();
        assertThat(subscriptions.findByEndpoint(current.getEndpoint()).orElseThrow().isEnabled()).isTrue();
    }

    @Test
    void cannotDisconnectOtherMembersSubscriptionOnLogout() {
        // Given
        Member owner = member("101");
        var otherSubscription = subscription(member("102"), "other");
        String refresh = issuer.issue(owner).value();
        // When
        Response response = mutation(owner).cookie(cookies.refreshTokenName(), refresh).contentType("application/json")
                .body(Map.of("pushSubscriptionId", otherSubscription.getId(), "generation", 1)).post("/auth/logout");
        // Then
        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(refreshTokens.findByTokenHash(hasher.hash(refresh))).isPresent();
        assertThat(subscriptions.findByEndpoint(otherSubscription.getEndpoint()).orElseThrow().isEnabled()).isTrue();
    }

    @Test
    @DisplayName("잘못된 연결 버전으로 로그아웃하면 토큰 폐기와 구독 해제를 모두 롤백한다.")
    void staleGenerationRollsBackLogout() {
        // Given
        Member owner = member("101");
        var current = subscription(owner, "current");
        String refresh = issuer.issue(owner).value();
        // When
        Response response = mutation(owner).cookie(cookies.refreshTokenName(), refresh).contentType("application/json")
                .body(Map.of("pushSubscriptionId", current.getId(), "generation", 2)).post("/auth/logout");
        // Then
        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(refreshTokens.findByTokenHash(hasher.hash(refresh))).isPresent();
        assertThat(subscriptions.findByIdAndMemberId(current.getId(), owner.getId()).orElseThrow().isEnabled()).isTrue();
        assertThat(response.detailedCookie(cookies.accessTokenName())).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"pushSubscriptionId\":1}", "{\"generation\":1}",
            "{\"pushSubscriptionId\":0,\"generation\":1}", "{\"pushSubscriptionId\":1,\"generation\":-1}"})
    @DisplayName("로그아웃 본문은 구독 ID와 연결 버전을 함께 양수로 요구한다.")
    void rejectPartialOrInvalidBody(String body) {
        // Given
        Member owner = member("101");
        String refresh = issuer.issue(owner).value();
        // When
        Response response = mutation(owner).cookie(cookies.refreshTokenName(), refresh).contentType("application/json")
                .body(body).post("/auth/logout");
        // Then
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(refreshTokens.findByTokenHash(hasher.hash(refresh))).isPresent();
    }
}
