package com.project.jarihana.notification;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.domain.SystemRejectionReason;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.notification.domain.Notification;
import com.project.jarihana.notification.domain.NotificationEventType;
import com.project.jarihana.notification.domain.NotificationPayload;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;
import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import io.restassured.RestAssured;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationInboxAcceptanceTest extends NotificationIntegrationTestSupport {

    @Autowired private AccessTokenProvider tokens;
    @Autowired private AuthCookieProperties cookies;
    @Autowired private NotificationDeliveryCommandRepository deliveries;

    @Test
    @DisplayName("알림 목록은 본인의 미삭제 항목을 읽음 여부와 무관하게 최신순 커서로 반환한다.")
    void listOwnNotificationsWithStableCursor() {
        // Given
        Member owner = member("101");
        Member other = member("102");
        Notification first = notification(owner, "one");
        Notification second = notification(owner, "two");
        notifications.save(second.markRead(NOW));
        Notification third = notification(owner, "three");
        notifications.save(notification(owner, "deleted").delete(NOW));
        notification(other, "other");

        // When
        Response page = authenticated(owner).queryParam("size", 2).get("/notifications");
        Response last = authenticated(owner).queryParam("size", 2)
                .queryParam("cursor", page.jsonPath().getString("data.nextCursor")).get("/notifications");

        // Then
        assertThat(page.statusCode()).isEqualTo(200);
        assertThat(page.jsonPath().getList("data.items.id", Long.class)).containsExactly(third.getId(), second.getId());
        assertThat(page.jsonPath().getBoolean("data.hasNext")).isTrue();
        assertThat(page.jsonPath().getString("data.items[1].readAt")).isNotNull();
        assertThat(last.statusCode()).isEqualTo(200);
        assertThat(last.jsonPath().getList("data.items.id", Long.class)).containsExactly(first.getId());
        assertThat(last.jsonPath().getBoolean("data.hasNext")).isFalse();
        assertThat(last.jsonPath().getString("data.nextCursor")).isNull();
        assertThat(page.header("Cache-Control")).contains("no-store");
        assertThat(page.asString()).doesNotContain("eventKey", "deletedAt", "endpoint", "p256dh", "auth");
    }

    @Test
    @DisplayName("개별 조회는 표시 문구와 내부 이동 대상을 반환하고 읽음 처리하지 않는다.")
    void findNotificationDoesNotReadAndProvidesTarget() {
        // Given
        Member owner = member("101");
        Notification notification = notification(owner, "one");
        Notification leaderNotification = notifications.save(Notification.create(owner, "leader",
                NotificationEventType.REGISTRATION_SUBMITTED, NotificationPayload.of(12, 45, 123, null), NOW));

        // When
        Response response = authenticated(owner).get("/notifications/" + notification.getId());
        Response leader = authenticated(owner).get("/notifications/" + leaderNotification.getId());

        // Then
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.jsonPath().getString("data.title")).isEqualTo("신청 승인");
        assertThat(response.jsonPath().getString("data.body")).isNotBlank();
        assertThat(response.jsonPath().getString("data.target.kind")).isEqualTo("GROUP_DETAIL");
        assertThat(response.jsonPath().getLong("data.target.groupId")).isEqualTo(12);
        assertThat(response.jsonPath().getLong("data.target.recruitmentId")).isEqualTo(45);
        assertThat(response.jsonPath().getString("data.readAt")).isNull();
        assertThat(response.header("Cache-Control")).contains("no-store");
        assertThat(leader.jsonPath().getString("data.target.kind")).isEqualTo("GROUP_DETAIL");
        assertThat(notifications.findByIdAndMemberId(notification.getId(), owner.getId()).orElseThrow().getReadAt()).isNull();
    }

    @ParameterizedTest
    @EnumSource(NotificationEventType.class)
    @DisplayName("모든 사건은 목록과 개별 조회에 모임 이름을 표시하고 모임 상세를 목적지로 반환한다.")
    void showGroupNameAndDetailTargetForEveryEvent(NotificationEventType eventType) {
        // Given
        Member owner = member("101");
        var recruitment = recruitment(owner, JoinMethod.APPROVAL, 5);
        var group = recruitment.getGroup();
        Notification notification = notifications.save(Notification.create(owner, "named-event", eventType,
                NotificationPayload.of(group.getId(), recruitment.getId(), 123,
                        eventType == NotificationEventType.REGISTRATION_SYSTEM_REJECTED
                                ? SystemRejectionReason.RERECRUITMENT : null), NOW));

        // When
        Response detail = authenticated(owner).get("/notifications/" + notification.getId());
        Response list = authenticated(owner).get("/notifications");

        // Then
        assertThat(detail.statusCode()).isEqualTo(200);
        assertThat(detail.jsonPath().getString("data.body")).contains(group.getName());
        assertThat(detail.jsonPath().getString("data.target.kind")).isEqualTo("GROUP_DETAIL");
        assertThat(detail.jsonPath().getLong("data.target.groupId")).isEqualTo(group.getId());
        assertThat(list.jsonPath().getString("data.items[0].body"))
                .isEqualTo(detail.jsonPath().getString("data.body"));
    }

    @Test
    @DisplayName("모임이 없어도 알림 기록과 사건 문구는 조회할 수 있다.")
    void preserveNotificationForMissingGroup() {
        // Given
        Member owner = member("101");
        Notification notification = notification(owner, "missing-group");

        // When
        Response detail = authenticated(owner).get("/notifications/" + notification.getId());

        // Then
        assertThat(detail.statusCode()).isEqualTo(200);
        assertThat(detail.jsonPath().getString("data.body")).isEqualTo("삭제된 모임의 신청이 승인되었습니다.");
    }

    @Test
    @DisplayName("안 읽은 수는 본인의 미삭제·미읽음 전체 기록만 센다.")
    void countOnlyOwnUnreadNotifications() {
        // Given
        Member owner = member("101");
        notification(owner, "one");
        notification(owner, "two");
        notifications.save(notification(owner, "read").markRead(NOW));
        notifications.save(notification(owner, "deleted").delete(NOW));
        notification(member("102"), "other");

        // When
        Response response = authenticated(owner).get("/notifications/unread-count");

        // Then
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.jsonPath().getLong("data.unreadCount")).isEqualTo(2);
        assertThat(response.header("Cache-Control")).contains("no-store");
    }

    @Test
    @DisplayName("개별 읽음을 반복해도 최초 읽은 시각을 유지하며 목록에 남는다.")
    void repeatedReadPreservesFirstTimestampAndListItem() {
        // Given
        Member owner = member("101");
        Notification notification = notifications.save(notification(owner, "one").markRead(NOW.minusHours(1)));

        // When
        Response response = mutation(owner).patch("/notifications/" + notification.getId() + "/read");

        // Then
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.jsonPath().getLong("data.id")).isEqualTo(notification.getId());
        assertThat(response.jsonPath().getString("data.readAt")).isEqualTo("2026-08-19T09:00:00");
        assertThat(authenticated(owner).get("/notifications").jsonPath().getList("data.items")).hasSize(1);
    }

    @Test
    @DisplayName("전체 읽음은 모든 페이지의 미읽음을 처리하고 기존 읽은 시각과 목록은 유지한다.")
    void readAllProcessesWholeInboxAndRemainsIdempotent() {
        // Given
        Member owner = member("101");
        for (int i = 0; i < 25; i++) {
            notification(owner, "event" + i);
        }
        Notification read = notifications.save(notification(owner, "read").markRead(NOW.minusHours(1)));
        notification(member("102"), "other");

        // When
        Response response = mutation(owner).patch("/notifications/read-all");
        Response repeated = mutation(owner).patch("/notifications/read-all");

        // Then
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.jsonPath().getInt("data.updatedCount")).isEqualTo(25);
        assertThat(response.jsonPath().getString("data.readAt")).isEqualTo("2026-08-19T10:00:00");
        assertThat(repeated.jsonPath().getInt("data.updatedCount")).isZero();
        assertThat(authenticated(owner).get("/notifications/unread-count").jsonPath().getLong("data.unreadCount")).isZero();
        assertThat(notifications.findByIdAndMemberId(read.getId(), owner.getId()).orElseThrow().getReadAt()).isEqualTo(NOW.minusHours(1));
        assertThat(jdbc.queryForObject("select count(*) from notifications where member_id = ? and deleted_at is null",
                Integer.class, owner.getId())).isEqualTo(26);
        assertThat(jdbc.queryForObject("select count(*) from notifications where read_at is null", Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("삭제는 기록을 남겨 중복을 막고 미완료 전송만 취소하며 반복 삭제도 성공한다.")
    void deletionHidesInboxAndCancelsOnlyUnfinishedDeliveries() {
        // Given
        Member owner = member("101");
        Notification notification = notification(owner, "one");
        NotificationDelivery pending = deliveries.save(NotificationDelivery.create(notification, subscription(owner, "pending"), NOW, NOW.plusDays(1)));
        NotificationDelivery accepted = deliveries.save(NotificationDelivery.create(notification, subscription(owner, "accepted"), NOW, NOW.plusDays(1)));
        jdbc.update("update notification_deliveries set status = 'ACCEPTED', attempt_count = 1, accepted_at = ? where id = ?", NOW, accepted.getId());

        // When
        Response response = mutation(owner).delete("/notifications/" + notification.getId());
        Response repeated = mutation(owner).delete("/notifications/" + notification.getId());

        // Then
        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(response.asString()).isEmpty();
        assertThat(repeated.statusCode()).isEqualTo(204);
        assertThat(authenticated(owner).get("/notifications").jsonPath().getList("data.items")).isEmpty();
        assertThat(authenticated(owner).get("/notifications/unread-count").jsonPath().getLong("data.unreadCount")).isZero();
        assertThat(authenticated(owner).get("/notifications/" + notification.getId()).statusCode()).isEqualTo(404);
        assertThat(jdbc.queryForObject("select status from notification_deliveries where id = ?", String.class, pending.getId())).isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("select status from notification_deliveries where id = ?", String.class, accepted.getId())).isEqualTo("ACCEPTED");
        assertThat(notifications.findByEventKeyAndMemberId("one", owner.getId()).orElseThrow().getDeletedAt()).isEqualTo(NOW);
    }

    @ParameterizedTest
    @CsvSource({"GET,''", "PATCH,/read", "DELETE,''"})
    @DisplayName("타인의 알림과 없는 알림은 같은 404로 응답하며 데이터를 변경하지 않는다.")
    void hideAnotherMembersNotification(String method, String suffix) {
        // Given
        Member owner = member("101");
        Member other = member("102");
        Notification notification = notification(owner, "one");

        // When
        Response response = mutation(other).request(method, "/notifications/" + notification.getId() + suffix);
        Response missing = mutation(other).request(method, "/notifications/999999" + suffix);

        // Then
        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("NOTIFICATION_NOT_FOUND");
        assertThat(missing.statusCode()).isEqualTo(404);
        assertThat(missing.jsonPath().getString("error.code")).isEqualTo("NOTIFICATION_NOT_FOUND");
        Notification unchanged = notifications.findByIdAndMemberId(notification.getId(), owner.getId()).orElseThrow();
        assertThat(unchanged.getReadAt()).isNull();
        assertThat(unchanged.getDeletedAt()).isNull();
    }

    @ParameterizedTest
    @CsvSource({"PATCH,/1/read", "PATCH,/read-all", "DELETE,/1"})
    @DisplayName("알림 변경 요청에는 CSRF 검증을 적용한다.")
    void rejectMutationWithoutCsrf(String method, String path) {
        // Given
        Member owner = member("101");

        // When
        Response response = authenticated(owner).request(method, "/notifications" + path);

        // Then
        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("ACCESS_DENIED");
    }

    @ParameterizedTest
    @CsvSource({"GET,''", "GET,/1", "GET,/unread-count", "PATCH,/1/read", "PATCH,/read-all", "DELETE,/1"})
    @DisplayName("알림함 API는 인증이 없는 요청을 거절한다.")
    void rejectUnauthenticatedRequest(String method, String path) {
        // Given
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");

        // When
        Response response = RestAssured.given().cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .request(method, "/notifications" + path);

        // Then
        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("UNAUTHENTICATED");
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "101", "-1", "abc"})
    @DisplayName("허용 범위를 벗어나거나 잘못된 목록 size는 거절한다.")
    void rejectInvalidPageSize(String size) {
        // Given
        Member owner = member("101");

        // When
        Response response = authenticated(owner).queryParam("size", size).get("/notifications");

        // Then
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("INVALID_PARAMETER");
    }

    @ParameterizedTest
    @ValueSource(strings = {"not-a-cursor", "Mg==", "", "MXwyMDI2LTA4LTE5VDEwOjAwOjAwfC0x"})
    @DisplayName("형식·버전·식별자가 잘못된 커서는 거절한다.")
    void rejectInvalidCursor(String cursor) {
        // Given
        Member owner = member("101");

        // When
        Response response = authenticated(owner).queryParam("cursor", cursor).get("/notifications");

        // Then
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("INVALID_PARAMETER");
    }

    @ParameterizedTest
    @CsvSource({"GET,0,''", "GET,-1,''", "GET,abc,''", "PATCH,0,/read", "DELETE,-1,''"})
    @DisplayName("잘못된 알림 식별자는 INVALID_PARAMETER로 응답한다.")
    void rejectInvalidNotificationId(String method, String id, String suffix) {
        // Given
        Member owner = member("101");

        // When
        Response response = mutation(owner).request(method, "/notifications/" + id + suffix);

        // Then
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("INVALID_PARAMETER");
    }

    @ParameterizedTest
    @CsvSource({"GET,''", "GET,/1", "GET,/unread-count", "PATCH,/1/read", "PATCH,/read-all", "DELETE,/1"})
    @DisplayName("존재하지 않는 회원의 토큰으로는 알림함에 접근할 수 없다.")
    void rejectTokenForMissingMember(String method, String path) {
        // Given
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");

        // When
        Response response = RestAssured.given().cookie(cookies.accessTokenName(), tokens.issue(999999L).value())
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf).request(method, "/notifications" + path);

        // Then
        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("UNAUTHENTICATED");
    }

    @ParameterizedTest
    @EnumSource(DeliveryStatus.class)
    @DisplayName("알림 삭제는 대기·재시도·처리 중 작업만 취소하고 선점 정보를 정리한다.")
    void cancellationPreservesCompletedDeliveryStates(DeliveryStatus state) {
        // Given
        Member owner = member("101");
        Notification notification = notification(owner, "one");
        NotificationDelivery delivery = deliveries.save(NotificationDelivery.create(notification, subscription(owner, "one"), NOW, NOW.plusDays(1)));
        jdbc.update("""
                update notification_deliveries set status = ?, attempt_count = ?, lease_token = ?, locked_until = ?, accepted_at = ?
                where id = ?
                """, state.name(), state == DeliveryStatus.PENDING || state == DeliveryStatus.CANCELLED ? 0 : 1,
                state == DeliveryStatus.IN_FLIGHT ? UUID.randomUUID() : null,
                state == DeliveryStatus.IN_FLIGHT ? NOW.plusMinutes(1) : null,
                state == DeliveryStatus.ACCEPTED ? NOW : null, delivery.getId());

        // When
        Response response = mutation(owner).delete("/notifications/" + notification.getId());

        // Then
        assertThat(response.statusCode()).isEqualTo(204);
        DeliveryStatus expected = switch (state) {
            case PENDING, RETRY, IN_FLIGHT -> DeliveryStatus.CANCELLED;
            case ACCEPTED, FAILED, CANCELLED -> state;
        };
        NotificationDelivery stored = deliveries.findById(delivery.getId()).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(expected);
        assertThat(stored.getLeaseToken()).isNull();
        assertThat(stored.getLockedUntil()).isNull();
        assertThat(stored.getAcceptedAt()).isEqualTo(state == DeliveryStatus.ACCEPTED ? NOW : null);
    }

    private RequestSpecification authenticated(Member member) {
        return RestAssured.given().cookie(cookies.accessTokenName(), tokens.issue(member.getId()).value());
    }

    private RequestSpecification mutation(Member member) {
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");
        return authenticated(member).cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf);
    }
}
