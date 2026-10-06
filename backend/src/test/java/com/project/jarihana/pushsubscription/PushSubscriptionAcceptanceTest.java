package com.project.jarihana.pushsubscription;

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

import java.util.Base64;
import java.util.Map;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class PushSubscriptionAcceptanceTest extends PushIntegrationTestSupport {

    @Autowired private NotificationDeliveryCommandRepository deliveries;

    @Test
    @DisplayName("푸시 설정은 공개키와 활성 상태만 제공하며 인증을 요구한다.")
    void configExposesOnlyPublicSettings() {
        // Given
        Member owner = member("101");
        // When
        Response response = authenticated(owner).get("/push-config");
        // Then
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.jsonPath().getBoolean("data.enabled")).isTrue();
        assertThat(Base64.getUrlDecoder().decode(response.jsonPath().getString("data.vapidPublicKey"))).hasSize(65);
        assertThat(response.asString()).doesNotContain("private", "subject");
        assertThat(RestAssured.get("/push-config").statusCode()).isEqualTo(401);
    }

    @Test
    @DisplayName("새 구독은 201을 반환하고 동일 구독 재등록은 버전을 유지하며 200을 반환한다.")
    void registerAndRepeatWithoutGenerationChange() {
        // Given
        Member owner = member("101");
        var request = body(owner, "fixture");
        request = Map.of("endpoint", "https://fcm.googleapis.com/new-endpoint", "keys", request.get("keys"));
        // When
        Response created = mutation(owner).contentType("application/json").body(request).post("/push-subscriptions");
        Response repeated = mutation(owner).contentType("application/json").body(request).post("/push-subscriptions");
        // Then
        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(repeated.statusCode()).isEqualTo(200);
        assertThat(repeated.jsonPath().getLong("data.id")).isEqualTo(created.jsonPath().getLong("data.id"));
        assertThat(repeated.jsonPath().getLong("data.generation")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from push_subscriptions where endpoint = ?",
                Long.class, request.get("endpoint"))).isEqualTo(1);
    }

    @Test
    @DisplayName("해제와 재연결은 연결 버전을 증가시키고 과거 작업을 취소하며 소급 전송하지 않는다.")
    void disableAndReconnectCancelOldWork() {
        // Given
        Member owner = member("101");
        var request = body(owner, "one");
        var subscription = subscriptions.findByEndpoint((String) request.get("endpoint")).orElseThrow();
        var delivery = deliveries.save(NotificationDelivery.create(notification(owner, "event"), subscription, NOW, NOW.plusDays(1)));
        // When
        Response deleted = mutation(owner).delete("/push-subscriptions/" + subscription.getId());
        Response repeated = mutation(owner).delete("/push-subscriptions/" + subscription.getId());
        Response reconnect = mutation(owner).contentType("application/json").body(request).post("/push-subscriptions");
        // Then
        assertThat(deleted.statusCode()).isEqualTo(204);
        assertThat(repeated.statusCode()).isEqualTo(204);
        assertThat(reconnect.statusCode()).isEqualTo(200);
        assertThat(reconnect.jsonPath().getLong("data.generation")).isEqualTo(3);
        assertThat(deliveries.findById(delivery.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.CANCELLED);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Long.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("다른 회원의 endpoint는 비활성 상태여도 가져올 수 없고 조회·해제도 거절한다.")
    void rejectOtherAccountBinding() {
        // Given
        Member owner = member("101");
        Member other = member("102");
        var request = body(owner, "one");
        var subscription = subscriptions.findByEndpoint((String) request.get("endpoint")).orElseThrow();
        subscriptions.save(subscription.disable(NOW));
        // When
        Response conflict = mutation(other).contentType("application/json").body(request).post("/push-subscriptions");
        Response denied = mutation(other).delete("/push-subscriptions/" + subscription.getId());
        // Then
        assertThat(conflict.statusCode()).isEqualTo(409);
        assertThat(conflict.jsonPath().getString("error.code")).isEqualTo("PUSH_SUBSCRIPTION_CONFLICT");
        assertThat(denied.statusCode()).isEqualTo(404);
        assertThat(authenticated(other).get("/push-subscriptions").jsonPath().getList("data.items")).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"http://fcm.googleapis.com/x", "https://localhost/x", "https://127.0.0.1/x",
            "https://fcm.googleapis.com.attacker.test/x", "https://user@fcm.googleapis.com/x",
            "https://fcm.googleapis.com:444/x", "https://fcm.googleapis.com/x#fragment"})
    @DisplayName("허용되지 않은 푸시 주소는 거절한다.")
    void rejectUnsafeEndpoints(String endpoint) {
        // Given
        Member owner = member("101");
        var request = body(owner, "fixture");
        // When
        Response response = mutation(owner).contentType("application/json")
                .body(Map.of("endpoint", endpoint, "keys", request.get("keys"))).post("/push-subscriptions");
        // Then
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("INVALID_PARAMETER");
    }

    @Test
    @DisplayName("구독 목록은 본인 행만 커서로 반환하고 주소와 암호화 키는 노출하지 않는다.")
    void listOwnSubscriptionsWithCursor() {
        // Given
        Member owner = member("101");
        var first = subscription(owner, "first");
        var second = subscription(owner, "second");
        subscription(member("102"), "other");
        // When
        Response page = authenticated(owner).queryParam("size", 1).get("/push-subscriptions");
        Response last = authenticated(owner).queryParam("size", 1)
                .queryParam("cursor", page.jsonPath().getString("data.nextCursor")).get("/push-subscriptions");
        // Then
        assertThat(page.statusCode()).isEqualTo(200);
        assertThat(page.jsonPath().getLong("data.items[0].id")).isEqualTo(second.getId());
        assertThat(last.jsonPath().getLong("data.items[0].id")).isEqualTo(first.getId());
        assertThat(last.jsonPath().getBoolean("data.hasNext")).isFalse();
        assertThat(page.asString()).doesNotContain("endpoint", "p256dh", "auth");
        assertThat(page.header("Cache-Control")).contains("no-store");
    }

    @Test
    @DisplayName("푸시 내용은 본인의 미삭제 알림과 활성 연결 버전이 모두 일치할 때만 제공한다.")
    void pushContentChecksOwnerAndGeneration() {
        // Given
        Member owner = member("101");
        var subscription = subscription(owner, "one");
        var notification = notification(owner, "event");
        String path = "/notifications/" + notification.getId() + "/push-content";
        // When
        Response valid = authenticated(owner).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", 1).get(path);
        Response invalid = authenticated(owner).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", 2).get(path);
        // Then
        assertThat(valid.statusCode()).isEqualTo(200);
        assertThat(valid.jsonPath().getLong("data.notificationId")).isEqualTo(notification.getId());
        assertThat(valid.jsonPath().getLong("data.payload.groupId")).isEqualTo(12);
        assertThat(valid.header("Cache-Control")).contains("no-store");
        assertThat(invalid.statusCode()).isEqualTo(404);
        assertThat(authenticated(member("102")).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", 1).get(path).statusCode()).isEqualTo(404);
        notifications.save(notification.delete(NOW));
        assertThat(authenticated(owner).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", 1).get(path).statusCode()).isEqualTo(404);
    }

    @Test
    @DisplayName("암호화 키 교체는 연결 버전을 증가시키고 이전 키 전송을 취소한다.")
    void replacementKeyCancelsOldGeneration() {
        // Given
        Member owner = member("101");
        var subscription = subscription(owner, "one");
        var pending = deliveries.save(NotificationDelivery.create(notification(owner, "event"), subscription, NOW, NOW.plusDays(1)));
        var body = Map.of("endpoint", subscription.getEndpoint(), "keys", Map.of("p256dh", subscription.getP256dh(),
                "auth", "AQAAAAAAAAAAAAAAAAAAAA"));
        // When
        Response response = mutation(owner).contentType("application/json").body(body).post("/push-subscriptions");
        // Then
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.jsonPath().getLong("data.generation")).isEqualTo(2);
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.CANCELLED);
    }

    @Test
    void endpointLimitUsesUtf8BytesAndPreservesOriginalAddress() {
        // Given
        Member owner = member("101");
        var keys = body(owner, "fixture").get("keys");
        String prefix = "https://fcm.googleapis.com/";
        String endpoint = prefix + "a".repeat(2048 - prefix.length() - 3) + "한";
        // When
        Response accepted = mutation(owner).contentType("application/json").body(Map.of("endpoint", endpoint, "keys", keys)).post("/push-subscriptions");
        Response oversized = mutation(owner).contentType("application/json").body(Map.of("endpoint", endpoint + "한", "keys", keys)).post("/push-subscriptions");
        // Then
        assertThat(endpoint.getBytes(StandardCharsets.UTF_8)).hasSize(2048);
        assertThat(accepted.statusCode()).isEqualTo(201);
        assertThat(subscriptions.findByEndpoint(endpoint)).isPresent();
        assertThat(oversized.statusCode()).isEqualTo(400);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"endpoint\":\"https://fcm.googleapis.com/test\"}",
            "{\"endpoint\":\"https://fcm.googleapis.com/test\",\"keys\":{\"p256dh\":\"bad\",\"auth\":\"bad\"}}"})
    void rejectMissingOrInvalidKeys(String body) {
        // Given
        Member owner = member("101");
        // When
        Response response = mutation(owner).contentType("application/json").body(body).post("/push-subscriptions");
        // Then
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(jdbc.queryForObject("select count(*) from push_subscriptions", Long.class)).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"size=0", "size=101", "size=bad", "cursor=", "cursor=broken"})
    void rejectInvalidListParameters(String query) {
        // Given
        Member owner = member("101");
        // When
        Response response = authenticated(owner).get("/push-subscriptions?" + query);
        // Then
        assertThat(response.statusCode()).isEqualTo(400);
    }

    @Test
    void signedTokenForAbsentMemberCannotUsePushApis() {
        // Given
        Member owner = member("101");
        var subscription = subscription(owner, "one");
        String absent = tokens.issue(99999999L).value();
        // When / Then
        assertThat(RestAssured.given().cookie(cookies.accessTokenName(), absent).get("/push-config").statusCode()).isEqualTo(401);
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");
        assertThat(RestAssured.given().cookie(cookies.accessTokenName(), absent).cookie("XSRF-TOKEN", csrf)
                .header("X-XSRF-TOKEN", csrf).delete("/push-subscriptions/" + subscription.getId()).statusCode()).isEqualTo(401);
    }

    @Test
    @DisplayName("구독 등록과 해제는 CSRF 검증을 요구한다.")
    void mutationsRequireCsrf() {
        // Given
        Member owner = member("101");
        var request = body(owner, "one");
        var subscription = subscriptions.findByEndpoint((String) request.get("endpoint")).orElseThrow();
        // When
        Response created = authenticated(owner).contentType("application/json").body(request).post("/push-subscriptions");
        Response deleted = authenticated(owner).delete("/push-subscriptions/" + subscription.getId());
        // Then
        assertThat(created.statusCode()).isEqualTo(403);
        assertThat(deleted.statusCode()).isEqualTo(403);
        assertThat(subscriptions.findByIdAndMemberId(subscription.getId(), owner.getId()).orElseThrow().isEnabled()).isTrue();
    }
}
