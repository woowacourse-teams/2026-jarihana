package com.project.jarihana.notification;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.notificationdelivery.command.repository.PushDeliveryWorkRepository;
import com.project.jarihana.notificationdelivery.command.service.PushDeliveryLeaseService;
import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import io.restassured.RestAssured;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.flywaydb.core.Flyway;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;

import static org.assertj.core.api.Assertions.assertThat;

@Import(AnnouncementReadCompatibilityAcceptanceTest.FutureSchema.class)
class AnnouncementReadCompatibilityAcceptanceTest extends NotificationIntegrationTestSupport {

    @Autowired private AccessTokenProvider tokens;
    @Autowired private AuthCookieProperties cookies;

    @Autowired private NotificationDeliveryCommandRepository deliveries;
    @Autowired private PushDeliveryWorkRepository work;
    @Autowired private PushDeliveryLeaseService leases;
    @Autowired private PlatformTransactionManager transactions;

    @Test
    @DisplayName("기존 SW 구독에 남아 있는 공지 전송 작업은 선점 시 취소하고 일반 알림은 계속 보낸다.")
    void cancelsAnnouncementForLegacySubscriptionAtClaim() {
        // Given
        Member owner = member("101");
        long id = futureAnnouncement(owner);
        var subscription = subscription(owner, "legacy-queued");
        var announcement = notifications.findByIdAndMemberId(id, owner.getId()).orElseThrow();
        var hidden = deliveries.save(NotificationDelivery.create(announcement, subscription, NOW, NOW.plusDays(1)));
        var normal = deliveries.save(NotificationDelivery.create(notification(owner, "normal"), subscription, NOW, NOW.plusDays(1)));
        // When
        var claims = new TransactionTemplate(transactions).execute(status -> work.claimNext(NOW, NOW.plusMinutes(1), 2));
        var requests = leases.prepare(claims);
        // Then
        assertThat(deliveries.findById(hidden.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.CANCELLED);
        assertThat(requests).extracting(request -> request.deliveryId()).containsExactly(normal.getId());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    @DisplayName("공지 지원 구독도 선점 후 지원 상태가 바뀌면 전송 준비에서 제외한다.")
    void checksWorkerSupportAgainBeforeSending(boolean downgrade) {
        // Given
        Member owner = member("101");
        long id = futureAnnouncement(owner);
        var subscription = subscription(owner, "current-queued");
        jdbc.update("update push_subscriptions set client_version = 2 where id = ?", subscription.getId());
        var announcement = notifications.findByIdAndMemberId(id, owner.getId()).orElseThrow();
        var pending = deliveries.save(NotificationDelivery.create(announcement, subscription, NOW, NOW.plusDays(1)));
        var claims = new TransactionTemplate(transactions).execute(status -> work.claimNext(NOW, NOW.plusMinutes(1), 1));
        // When
        if (downgrade) jdbc.update("update push_subscriptions set client_version = 1 where id = ?", subscription.getId());
        var requests = leases.prepare(claims);
        // Then
        if (downgrade) {
            assertThat(requests).isEmpty();
            assertThat(deliveries.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.CANCELLED);
        } else {
            assertThat(requests).extracting(request -> request.deliveryId()).containsExactly(pending.getId());
        }
    }

    @Autowired private Flyway flyway;

    @TestConfiguration(proxyBeanMethods = false)
    static class FutureSchema {
        @Bean
        FlywayMigrationStrategy migrateFutureSchemaBeforeCompatibilityApp() {
            return original -> {
                String[] locations = new ClassPathResource("db/migration/V13__group_announcements.sql").exists()
                        ? new String[]{"classpath:db/migration"}
                        : new String[]{"classpath:db/migration", "classpath:db/announcement-compatibility"};
                Flyway.configure().configuration(original.getConfiguration()).locations(locations).load().migrate();
                original.migrate();
            };
        }
    }

    @Test
    @DisplayName("호환 앱은 후속 V13 스키마에서도 기본 Flyway 검증을 통과하고 이력을 바꾸지 않는다.")
    void compatibilityAppAcceptsFutureAnnouncementSchema() {
        // Given
        var history = jdbc.queryForList("select * from flyway_schema_history order by installed_rank");

        // When
        flyway.validate();
        int applied = flyway.migrate().migrationsExecuted;

        // Then
        assertThat(flyway.getConfiguration().isOutOfOrder()).isFalse();
        assertThat(applied).isZero();
        assertThat(jdbc.queryForList("select * from flyway_schema_history order by installed_rank")).isEqualTo(history);
        assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '13'", String.class))
                .isEqualTo("V13__group_announcements.sql");
    }

    @Test
    @DisplayName("구버전 클라이언트는 신규 공지 행이 있어도 기존 알림의 목록과 커서, 안 읽은 수를 정상 조회한다.")
    void legacyClientReadsExistingNotificationsAfterAnnouncementWrites() {
        // Given
        Member owner = member("101");
        var first = notification(owner, "legacy-first");
        var second = notification(owner, "legacy-second");
        long announcementNotificationId = futureAnnouncement(owner);

        // When
        Response page = authenticated(owner).queryParam("size", 1).get("/notifications");
        Response last = authenticated(owner).queryParam("size", 1)
                .queryParam("cursor", page.jsonPath().getString("data.nextCursor")).get("/notifications");
        Response unread = authenticated(owner).get("/notifications/unread-count");
        Response unsupported = authenticated(owner).get("/notifications/" + announcementNotificationId);

        // Then
        assertThat(page.statusCode()).isEqualTo(200);
        assertThat(page.jsonPath().getList("data.items.id", Long.class)).containsExactly(second.getId());
        assertThat(page.jsonPath().getBoolean("data.hasNext")).isTrue();
        assertThat(last.jsonPath().getList("data.items.id", Long.class)).containsExactly(first.getId());
        assertThat(last.jsonPath().getBoolean("data.hasNext")).isFalse();
        assertThat(last.jsonPath().getString("data.nextCursor")).isNull();
        assertThat(unread.jsonPath().getLong("data.unreadCount")).isEqualTo(2);
        assertThat(unsupported.statusCode()).isEqualTo(404);
    }

    @Test
    @DisplayName("공지 계약을 요청한 클라이언트는 신규 행의 목록과 상세, 읽음과 삭제를 처리한다.")
    void currentClientReadsAndUpdatesAnnouncementNotification() {
        // Given
        Member owner = member("101");
        notification(owner, "legacy");
        long id = futureAnnouncement(owner);

        // When
        Response page = authenticated(owner).queryParam("clientVersion", 2).get("/notifications");
        Response detail = authenticated(owner).queryParam("clientVersion", 2).get("/notifications/" + id);
        Response unread = authenticated(owner).queryParam("clientVersion", 2).get("/notifications/unread-count");
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");
        Response read = authenticated(owner).cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .patch("/notifications/" + id + "/read");
        Response deleted = authenticated(owner).cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .delete("/notifications/" + id);

        // Then
        assertThat(page.statusCode()).isEqualTo(200);
        assertThat(page.jsonPath().getLong("data.items[0].id")).isEqualTo(id);
        assertThat(detail.statusCode()).isEqualTo(200);
        assertThat(detail.jsonPath().getString("data.eventType")).isEqualTo("GROUP_ANNOUNCEMENT_CREATED");
        assertThat(detail.jsonPath().getString("data.target.kind")).isEqualTo("GROUP_ANNOUNCEMENT");
        assertThat(detail.jsonPath().getLong("data.target.announcementId")).isEqualTo(123);
        assertThat(unread.jsonPath().getLong("data.unreadCount")).isEqualTo(2);
        assertThat(read.statusCode()).isEqualTo(200);
        assertThat(deleted.statusCode()).isEqualTo(204);
    }

    @Test
    @DisplayName("구버전 전체 읽음은 숨겨진 공지를 읽지 않고 계약 2의 전체 읽음만 공지를 포함한다.")
    void readAllDoesNotReadHiddenAnnouncements() {
        // Given
        Member owner = member("101");
        notification(owner, "legacy");
        long id = futureAnnouncement(owner);
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");

        // When
        Response legacy = authenticated(owner).cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .patch("/notifications/read-all");
        Object hiddenReadAt = jdbc.queryForObject("select read_at from notifications where id = ?", Object.class, id);
        Response current = authenticated(owner).cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .queryParam("clientVersion", 2).patch("/notifications/read-all");

        // Then
        assertThat(legacy.statusCode()).isEqualTo(200);
        assertThat(legacy.jsonPath().getInt("data.updatedCount")).isEqualTo(1);
        assertThat(hiddenReadAt).isNull();
        assertThat(current.statusCode()).isEqualTo(200);
        assertThat(current.jsonPath().getInt("data.updatedCount")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select read_at from notifications where id = ?", Object.class, id)).isNotNull();
    }

    @Test
    @DisplayName("공지 미지원 Service Worker에는 내용을 반환하지 않고 지원 버전에는 식별자만 반환한다.")
    void pushContentHonorsClientContractAndOwnership() {
        // Given
        Member owner = member("101");
        Member other = member("102");
        long id = futureAnnouncement(owner);
        var subscription = subscription(owner, "announcement-compatibility");

        // When
        Response legacy = authenticated(owner).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", 1).get("/notifications/" + id + "/push-content");
        Response current = authenticated(owner).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", 1).queryParam("clientVersion", 2)
                .get("/notifications/" + id + "/push-content");
        Response forbidden = authenticated(other).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", 1).queryParam("clientVersion", 2)
                .get("/notifications/" + id + "/push-content");

        // Then
        assertThat(legacy.statusCode()).isEqualTo(404);
        assertThat(current.statusCode()).isEqualTo(200);
        assertThat(current.jsonPath().getMap("data.payload")).containsOnlyKeys("groupId", "announcementId");
        assertThat(forbidden.statusCode()).isEqualTo(404);
    }

    @Test
    @DisplayName("지원하지 않는 알림 클라이언트 계약은 400으로 거부한다.")
    void rejectsUnsupportedClientVersion() {
        // Given
        Member owner = member("101");
        long id = futureAnnouncement(owner);
        var subscription = subscription(owner, "invalid-contract");

        // When
        Response list = authenticated(owner).queryParam("clientVersion", 3).get("/notifications");
        Response detail = authenticated(owner).queryParam("clientVersion", 3).get("/notifications/" + id);
        Response count = authenticated(owner).queryParam("clientVersion", 3).get("/notifications/unread-count");
        Response push = authenticated(owner).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", 1).queryParam("clientVersion", 3)
                .get("/notifications/" + id + "/push-content");

        // Then
        assertThat(list.statusCode()).isEqualTo(400);
        assertThat(detail.statusCode()).isEqualTo(400);
        assertThat(count.statusCode()).isEqualTo(400);
        assertThat(push.statusCode()).isEqualTo(400);
    }

    private long futureAnnouncement(Member owner) {
        long groupId = recruitment(owner, JoinMethod.APPROVAL, 5).getGroup().getId();
        return jdbc.queryForObject("""
                insert into notifications (member_id, event_key, event_type, payload_version, payload, created_at, updated_at)
                values (?, 'future-announcement', 'GROUP_ANNOUNCEMENT_CREATED', 1, cast(? as jsonb), ?, ?)
                returning id
                """, Long.class, owner.getId(), "{\"groupId\":" + groupId + ",\"announcementId\":123}",
                NOW.plusMinutes(1), NOW.plusMinutes(1));
    }

    private RequestSpecification authenticated(Member member) {
        return RestAssured.given().cookie(cookies.accessTokenName(), tokens.issue(member.getId()).value());
    }
}
