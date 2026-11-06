package com.project.jarihana.notification;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;
import com.project.jarihana.recruitment.domain.JoinMethod;
import io.restassured.RestAssured;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;

import static org.assertj.core.api.Assertions.assertThat;

@Import(ChatReadCompatibilityAcceptanceTest.FutureSchema.class)
class ChatReadCompatibilityAcceptanceTest extends NotificationIntegrationTestSupport {

    @Autowired private AccessTokenProvider tokens;
    @Autowired private AuthCookieProperties cookies;
    @Autowired private Flyway flyway;

    @TestConfiguration(proxyBeanMethods = false)
    static class FutureSchema {
        @Bean
        FlywayMigrationStrategy migrateFutureSchemaBeforeCompatibilityApp() {
            return original -> {
                String[] locations = new ClassPathResource("db/migration/V21__chat_views.sql").exists()
                        ? new String[]{"classpath:db/migration"}
                        : new String[]{"classpath:db/migration", "classpath:db/chat-compatibility"};
                Flyway.configure().configuration(original.getConfiguration()).locations(locations).load().migrate();
                original.migrate();
            };
        }
    }

    @Test
    @DisplayName("호환 앱은 후속 V23 UNLOGGED 스키마와 채팅 알림을 보존한 채 기본 Flyway 검증을 통과한다.")
    void compatibilityAppAcceptsFutureChatSchemaWithoutRewritingHistoryOrNotifications() {
        // Given
        long id = futureChat(member("101"));
        var history = jdbc.queryForList("select * from flyway_schema_history order by installed_rank");
        var notification = jdbc.queryForMap("select * from notifications where id = ?", id);

        // When
        flyway.validate();
        int applied = flyway.migrate().migrationsExecuted;

        // Then
        assertThat(flyway.getConfiguration().isOutOfOrder()).isFalse();
        assertThat(applied).isZero();
        assertThat(jdbc.queryForList("select * from flyway_schema_history order by installed_rank")).isEqualTo(history);
        assertThat(jdbc.queryForMap("select * from notifications where id = ?", id)).isEqualTo(notification);
        assertThat(jdbc.queryForObject("select script from flyway_schema_history where version = '23'", String.class))
                .isEqualTo("V23__member_activity_unlogged.sql");
        assertThat(jdbc.queryForObject("select relpersistence from pg_class where oid = 'member_activity'::regclass", String.class))
                .isEqualTo("u");
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2})
    @DisplayName("구버전 클라이언트는 남은 채팅 알림을 제외하고 기존 목록·커서·미읽음 수를 정상 조회한다.")
    void legacyClientsReadExistingNotificationsWhenChatRowsRemain(int version) {
        // Given
        Member owner = member("101");
        var first = notification(owner, "first");
        var second = notification(owner, "second");
        long id = futureChat(owner);
        var originalChat = jdbc.queryForMap("select * from notifications where id = ?", id);

        // When
        Response page = authenticated(owner).queryParam("clientVersion", version).queryParam("size", 1)
                .get("/notifications");
        assertThat(page.statusCode()).isEqualTo(200);
        Response last = authenticated(owner).queryParam("clientVersion", version).queryParam("size", 1)
                .queryParam("cursor", page.jsonPath().getString("data.nextCursor")).get("/notifications");
        Response unread = authenticated(owner).queryParam("clientVersion", version).get("/notifications/unread-count");
        Response unsupported = authenticated(owner).queryParam("clientVersion", version).get("/notifications/" + id);

        // Then
        assertThat(page.jsonPath().getList("data.items.id", Long.class)).containsExactly(second.getId());
        assertThat(page.jsonPath().getBoolean("data.hasNext")).isTrue();
        assertThat(last.statusCode()).isEqualTo(200);
        assertThat(last.jsonPath().getList("data.items.id", Long.class)).containsExactly(first.getId());
        assertThat(last.jsonPath().getBoolean("data.hasNext")).isFalse();
        assertThat(last.jsonPath().getString("data.nextCursor")).isNull();
        assertThat(unread.statusCode()).isEqualTo(200);
        assertThat(unread.jsonPath().getLong("data.unreadCount")).isEqualTo(2);
        assertThat(unsupported.statusCode()).isEqualTo(404);
        assertThat(jdbc.queryForMap("select * from notifications where id = ?", id)).isEqualTo(originalChat);
    }

    @Test
    @DisplayName("채팅 계약을 요청한 클라이언트는 남은 채팅 알림의 목록·상세·개별 읽음·삭제를 처리한다.")
    void currentClientReadsAndUpdatesPersistedChatNotification() {
        // Given
        Member owner = member("101");
        notification(owner, "normal");
        long id = futureChat(owner);

        // When
        Response page = authenticated(owner).queryParam("clientVersion", 3).get("/notifications");
        Response detail = authenticated(owner).queryParam("clientVersion", 3).get("/notifications/" + id);
        Response unread = authenticated(owner).queryParam("clientVersion", 3).get("/notifications/unread-count");
        Response read = authenticatedWrite(owner).patch("/notifications/" + id + "/read");
        Response afterRead = authenticated(owner).queryParam("clientVersion", 3).get("/notifications/unread-count");
        Response deleted = authenticatedWrite(owner).delete("/notifications/" + id);

        // Then
        assertThat(page.statusCode()).isEqualTo(200);
        assertThat(page.jsonPath().getLong("data.items[0].id")).isEqualTo(id);
        assertThat(detail.statusCode()).isEqualTo(200);
        assertThat(detail.jsonPath().getString("data.eventType")).isEqualTo("CHAT_MESSAGE_RECEIVED");
        assertThat(detail.jsonPath().getString("data.title")).isEqualTo("새 메시지");
        assertThat(detail.jsonPath().getString("data.target.kind")).isEqualTo("GROUP_CHAT");
        assertThat(detail.jsonPath().getMap("data.target")).containsOnlyKeys("kind", "groupId");
        assertThat(unread.statusCode()).isEqualTo(200);
        assertThat(unread.jsonPath().getLong("data.unreadCount")).isEqualTo(2);
        assertThat(read.statusCode()).isEqualTo(200);
        assertThat(afterRead.jsonPath().getLong("data.unreadCount")).isEqualTo(1);
        assertThat(deleted.statusCode()).isEqualTo(204);
        assertThat(jdbc.queryForObject("select deleted_at from notifications where id = ?", Object.class, id)).isNotNull();
        assertThat(authenticated(owner).queryParam("clientVersion", 3).get("/notifications/" + id).statusCode()).isEqualTo(404);
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2})
    @DisplayName("기존 전체 읽음은 숨긴 채팅 알림을 보존하고 계약 3의 전체 읽음만 채팅을 포함한다.")
    void readAllDoesNotReadChatHiddenFromOlderClients(int version) {
        // Given
        Member owner = member("101");
        notification(owner, "normal");
        long id = futureChat(owner);

        // When
        Response legacy = authenticatedWrite(owner).queryParam("clientVersion", version).patch("/notifications/read-all");
        Object hiddenReadAt = jdbc.queryForObject("select read_at from notifications where id = ?", Object.class, id);
        Response current = authenticatedWrite(owner).queryParam("clientVersion", 3).patch("/notifications/read-all");

        // Then
        assertThat(legacy.statusCode()).isEqualTo(200);
        assertThat(legacy.jsonPath().getInt("data.updatedCount")).isEqualTo(1);
        assertThat(hiddenReadAt).isNull();
        assertThat(current.statusCode()).isEqualTo(200);
        assertThat(current.jsonPath().getInt("data.updatedCount")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select read_at from notifications where id = ?", Object.class, id)).isNotNull();
    }

    @Test
    @DisplayName("채팅 알림과 푸시 내용은 지원 계약과 소유권을 확인하며 구독 세대가 다르면 노출하지 않는다.")
    void readsPushContentOnlyForSupportedVersionOwnerAndGeneration() {
        // Given
        Member owner = member("101");
        Member other = member("102");
        long id = futureChat(owner);
        var subscription = subscription(owner, "chat-content");
        jdbc.update("update push_subscriptions set client_version = 3 where id = ?", subscription.getId());

        // When
        for (int version : new int[]{1, 2}) {
            Response legacy = authenticated(owner).queryParam("subscriptionId", subscription.getId())
                    .queryParam("generation", 1).queryParam("clientVersion", version)
                    .get("/notifications/" + id + "/push-content");
            assertThat(legacy.statusCode()).isEqualTo(404);
        }
        Response current = authenticated(owner).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", 1).queryParam("clientVersion", 3)
                .get("/notifications/" + id + "/push-content");
        Response wrongGeneration = authenticated(owner).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", 2).queryParam("clientVersion", 3)
                .get("/notifications/" + id + "/push-content");
        Response otherPush = authenticated(other).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", 1).queryParam("clientVersion", 3)
                .get("/notifications/" + id + "/push-content");

        // Then
        assertThat(current.statusCode()).isEqualTo(200);
        assertThat(current.jsonPath().getString("data.eventType")).isEqualTo("CHAT_MESSAGE_RECEIVED");
        assertThat(current.jsonPath().getMap("data.payload")).containsOnlyKeys("groupId");
        assertThat(wrongGeneration.statusCode()).isEqualTo(404);
        assertThat(otherPush.statusCode()).isEqualTo(404);
        assertThat(authenticated(other).queryParam("clientVersion", 3).get("/notifications/" + id).statusCode()).isEqualTo(404);
        assertThat(authenticatedWrite(other).patch("/notifications/" + id + "/read").statusCode()).isEqualTo(404);
        assertThat(authenticatedWrite(other).delete("/notifications/" + id).statusCode()).isEqualTo(404);
        assertThat(jdbc.queryForObject("select read_at from notifications where id = ?", Object.class, id)).isNull();
        assertThat(jdbc.queryForObject("select deleted_at from notifications where id = ?", Object.class, id)).isNull();
    }

    private long futureChat(Member owner) {
        long groupId = recruitment(owner, JoinMethod.APPROVAL, 5).getGroup().getId();
        return jdbc.queryForObject("""
                insert into notifications (member_id, event_key, event_type, payload_version, payload, created_at, updated_at)
                values (?, 'chat-message:123:created', 'CHAT_MESSAGE_RECEIVED', 1, cast(? as jsonb), ?, ?)
                returning id
                """, Long.class, owner.getId(), "{\"groupId\":" + groupId + "}", NOW.plusMinutes(1), NOW.plusMinutes(1));
    }

    private RequestSpecification authenticated(Member member) {
        return RestAssured.given().cookie(cookies.accessTokenName(), tokens.issue(member.getId()).value());
    }

    private RequestSpecification authenticatedWrite(Member member) {
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");
        return authenticated(member).cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf);
    }
}
