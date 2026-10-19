package com.project.jarihana.notification;

import com.project.jarihana.activitypost.command.repository.ActivityPostCommandRepository;
import com.project.jarihana.activitypost.domain.ActivityPost;
import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.group.domain.Group;
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
    @Autowired private ActivityPostCommandRepository posts;

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
        assertThat(response.jsonPath().getString("data.target.kind")).isEqualTo("MY_GROUPS");
        assertThat(response.jsonPath().getLong("data.target.groupId")).isEqualTo(12);
        assertThat(response.jsonPath().getLong("data.target.recruitmentId")).isEqualTo(45);
        assertThat(response.jsonPath().getString("data.readAt")).isNull();
        assertThat(response.header("Cache-Control")).contains("no-store");
        assertThat(leader.jsonPath().getString("data.target.kind")).isEqualTo("LEADER_REGISTRATIONS");
        assertThat(notifications.findByIdAndMemberId(notification.getId(), owner.getId()).orElseThrow().getReadAt()).isNull();
    }

    @ParameterizedTest
    @EnumSource(NotificationEventType.class)
    @DisplayName("모든 사건은 모임 이름과 사건별 이동 대상을 반환한다.")
    void showGroupNameAndTargetForEveryEvent(NotificationEventType eventType) {
        // Given
        Member owner = member("101");
        var recruitment = recruitment(owner, JoinMethod.APPROVAL, 5);
        var group = recruitment.getGroup();
        NotificationPayload payload = switch (eventType) {
            case GROUP_CREATED -> NotificationPayload.forGroup(group.getId());
            case INVITATION_RECEIVED -> NotificationPayload.invitation(group.getId(), 123);
            case ACTIVITY_POST_COMMENTED, ACTIVITY_POST_REACTED -> NotificationPayload.activityPost(group.getId(), 77);
            default -> NotificationPayload.of(group.getId(), recruitment.getId(), 123,
                    eventType == NotificationEventType.REGISTRATION_SYSTEM_REJECTED
                            ? SystemRejectionReason.RERECRUITMENT : null);
        };
        Notification notification = notifications.save(Notification.create(owner, "named-event", eventType,
                payload, NOW));

        // When
        Response detail = authenticated(owner).get("/notifications/" + notification.getId());
        Response list = authenticated(owner).get("/notifications");

        // Then
        assertThat(detail.statusCode()).isEqualTo(200);
        assertThat(detail.jsonPath().getString("data.body")).contains(group.getName());
        String expectedKind = switch (eventType) {
            case GROUP_CREATED -> "GROUP_DETAIL";
            case REGISTRATION_SUBMITTED -> "LEADER_REGISTRATIONS";
            case PARTICIPANT_JOINED -> "LEADER_MEMBERS";
            case REGISTRATION_APPROVED -> "MY_GROUPS";
            case REGISTRATION_REJECTED, REGISTRATION_SYSTEM_REJECTED -> "MY_PAGE";
            case INVITATION_RECEIVED -> "INVITATION";
            case ACTIVITY_POST_COMMENTED, ACTIVITY_POST_REACTED -> "ACTIVITY_POST";
        };
        assertThat(detail.jsonPath().getString("data.target.kind")).isEqualTo(expectedKind);
        assertThat(list.jsonPath().getString("data.items[0].target.kind")).isEqualTo(expectedKind);
        assertThat(detail.jsonPath().getLong("data.target.groupId")).isEqualTo(group.getId());
        if (eventType == NotificationEventType.INVITATION_RECEIVED) {
            assertThat(detail.jsonPath().getString("data.title")).isEqualTo("모임 초대");
            assertThat(detail.jsonPath().getMap("data.target").keySet()).containsExactlyInAnyOrder("kind", "groupId", "invitationId");
            assertThat(detail.jsonPath().getLong("data.target.invitationId")).isEqualTo(123);
        } else if (eventType == NotificationEventType.ACTIVITY_POST_COMMENTED
                || eventType == NotificationEventType.ACTIVITY_POST_REACTED) {
            assertThat(detail.jsonPath().getString("data.title"))
                    .isEqualTo(eventType == NotificationEventType.ACTIVITY_POST_COMMENTED ? "새 댓글" : "좋아요");
            assertThat(detail.jsonPath().getMap("data.target")).containsOnlyKeys("kind", "groupId", "activityPostId");
            assertThat(detail.jsonPath().getLong("data.target.activityPostId")).isEqualTo(77);
        } else if (eventType == NotificationEventType.GROUP_CREATED) {
            assertThat(detail.jsonPath().getMap("data.target")).containsOnlyKeys("kind", "groupId");
        } else {
            assertThat(detail.jsonPath().getLong("data.target.registrationId")).isEqualTo(123);
            assertThat(detail.jsonPath().getMap("data.target").keySet()).containsExactlyInAnyOrder("kind", "groupId", "recruitmentId", "registrationId");
        }
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

    @Test
    @DisplayName("모임 생성 API가 만든 알림은 알림함과 푸시 내용 API에서 새 모임 식별자로 조회된다.")
    void createdGroupAppearsInInboxAndPushContent() {
        // Given
        Member creator = member("101");
        Member recipient = member("102");
        var subscription = subscription(recipient, "new-group");

        // When
        Response created = mutation(creator).contentType("application/json").body("""
                {"type":"CLUB","name":"퇴근 후 독서","introduction":"함께 책을 읽어요","meetingType":"FLEXIBLE"}
                """).post("/groups");
        Response inbox = authenticated(recipient).get("/notifications");

        // Then
        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(inbox.statusCode()).isEqualTo(200);
        assertThat(inbox.jsonPath().getList("data.items")).hasSize(1);
        assertThat(inbox.jsonPath().getString("data.items[0].eventType")).isEqualTo("GROUP_CREATED");
        assertThat(inbox.jsonPath().getString("data.items[0].body")).isEqualTo("‘퇴근 후 독서’ 모임이 새로 등록되었습니다.");
        long notificationId = inbox.jsonPath().getLong("data.items[0].id");
        long groupId = jdbc.queryForObject("select id from groups where name = '퇴근 후 독서'", Long.class);
        assertThat(inbox.jsonPath().getLong("data.items[0].target.groupId")).isEqualTo(groupId);
        assertThat(inbox.jsonPath().getString("data.items[0].target.kind")).isEqualTo("GROUP_DETAIL");
        Response content = authenticated(recipient).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", subscription.getGeneration()).get("/notifications/" + notificationId + "/push-content");
        assertThat(content.statusCode()).isEqualTo(200);
        assertThat(content.jsonPath().getString("data.eventType")).isEqualTo("GROUP_CREATED");
        assertThat(content.jsonPath().getMap("data.payload")).containsOnlyKeys("groupId");
        assertThat(content.jsonPath().getLong("data.payload.groupId")).isEqualTo(groupId);
        assertThat(authenticated(creator).get("/notifications").jsonPath().getList("data.items")).isEmpty();
    }

    @Test
    @DisplayName("댓글 API가 만든 알림은 알림함과 푸시 내용 API에서 활동 기록 식별자로 조회된다.")
    void commentAppearsInAuthorInboxAndPushContent() {
        // Given
        Member author = member("101");
        Member commenter = member("102");
        var subscription = subscription(author, "comment");
        Group group = groups.save(Group.createClub("퇴근 후 독서", "함께 책을 읽어요", null, null, null, NOW.minusDays(10)));
        ActivityPost post = posts.save(ActivityPost.create(group, author, "첫 모임", NOW.toLocalDate(), NOW.minusDays(1)));

        // When
        Response created = mutation(commenter).contentType("application/json").body("""
                {"content":"다음 모임에 저도 갈게요"}
                """).post("/activity-posts/" + post.getId() + "/comments");
        Response inbox = authenticated(author).get("/notifications");

        // Then
        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(inbox.statusCode()).isEqualTo(200);
        assertThat(inbox.jsonPath().getList("data.items")).hasSize(1);
        assertThat(inbox.jsonPath().getString("data.items[0].eventType")).isEqualTo("ACTIVITY_POST_COMMENTED");
        assertThat(inbox.jsonPath().getString("data.items[0].title")).isEqualTo("새 댓글");
        assertThat(inbox.jsonPath().getString("data.items[0].body"))
                .isEqualTo("‘퇴근 후 독서’ 모임 활동 기록에 새 댓글이 달렸습니다.");
        assertThat(inbox.jsonPath().getString("data.items[0].target.kind")).isEqualTo("ACTIVITY_POST");
        assertThat(inbox.jsonPath().getLong("data.items[0].target.groupId")).isEqualTo(group.getId());
        assertThat(inbox.jsonPath().getLong("data.items[0].target.activityPostId")).isEqualTo(post.getId());
        assertThat(inbox.asString()).doesNotContain("다음 모임에 저도 갈게요", commenter.getCrewName());
        long notificationId = inbox.jsonPath().getLong("data.items[0].id");
        Response content = authenticated(author).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", subscription.getGeneration()).get("/notifications/" + notificationId + "/push-content");
        assertThat(content.statusCode()).isEqualTo(200);
        assertThat(content.jsonPath().getString("data.eventType")).isEqualTo("ACTIVITY_POST_COMMENTED");
        assertThat(content.jsonPath().getMap("data.payload")).containsOnlyKeys("groupId", "activityPostId");
        assertThat(content.jsonPath().getLong("data.payload.activityPostId")).isEqualTo(post.getId());
        assertThat(authenticated(commenter).get("/notifications").jsonPath().getList("data.items")).isEmpty();
    }

    @Test
    @DisplayName("좋아요 알림은 가장 최근에 누른 회원과 나머지 인원을 묶어 알림함과 푸시 내용 API에 보여 준다.")
    void heartsAppearAsOneSummaryInInboxAndPushContent() {
        // Given
        Member author = member("101");
        Member first = member("102");
        Member second = member("103");
        Member latest = member("104");
        var subscription = subscription(author, "heart");
        Group group = groups.save(Group.createClub("퇴근 후 독서", "함께 책을 읽어요", null, null, null, NOW.minusDays(10)));
        ActivityPost post = posts.save(ActivityPost.create(group, author, "첫 모임", NOW.toLocalDate(), NOW.minusDays(1)));
        String path = "/activity-posts/" + post.getId() + "/reactions/HEART";

        // When
        mutation(first).put(path);
        Response single = authenticated(author).get("/notifications");
        mutation(author).put(path);
        mutation(second).put(path);
        mutation(latest).put(path);
        Response summary = authenticated(author).get("/notifications");

        // Then
        assertThat(single.jsonPath().getString("data.items[0].title")).isEqualTo("좋아요");
        assertThat(single.jsonPath().getString("data.items[0].body"))
                .isEqualTo(first.getCrewName() + "님이 좋아요를 눌렀어요.");
        assertThat(summary.jsonPath().getList("data.items")).hasSize(1);
        assertThat(summary.jsonPath().getString("data.items[0].eventType")).isEqualTo("ACTIVITY_POST_REACTED");
        assertThat(summary.jsonPath().getString("data.items[0].body"))
                .isEqualTo(latest.getCrewName() + " 외 2명이 좋아요를 눌렀어요.");
        assertThat(summary.jsonPath().getString("data.items[0].target.kind")).isEqualTo("ACTIVITY_POST");
        assertThat(summary.jsonPath().getLong("data.items[0].target.activityPostId")).isEqualTo(post.getId());
        long notificationId = summary.jsonPath().getLong("data.items[0].id");
        Response content = authenticated(author).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", subscription.getGeneration()).get("/notifications/" + notificationId + "/push-content");
        assertThat(content.statusCode()).isEqualTo(200);
        assertThat(content.jsonPath().getString("data.eventType")).isEqualTo("ACTIVITY_POST_REACTED");
        assertThat(content.jsonPath().getMap("data.payload")).containsOnlyKeys("groupId", "activityPostId");
        assertThat(content.jsonPath().getString("data.reactionSummary.latestReactorName")).isEqualTo(latest.getCrewName());
        assertThat(content.jsonPath().getInt("data.reactionSummary.otherReactorCount")).isEqualTo(2);
    }

    @Test
    @DisplayName("좋아요를 누른 사람이 100명이면 이름으로 묶고, 100명을 넘으면 무수한 관심 문구로 바꾼다.")
    void heartsOverHundredUseAttentionMessage() {
        // Given
        Member author = member("101");
        Member latest = member("102");
        Group group = groups.save(Group.createClub("퇴근 후 독서", "함께 책을 읽어요", null, null, null, NOW.minusDays(10)));
        ActivityPost post = posts.save(ActivityPost.create(group, author, "첫 모임", NOW.toLocalDate(), NOW.minusDays(1)));
        heartsFromNewMembers(post, 1, 99);
        mutation(latest).put("/activity-posts/" + post.getId() + "/reactions/HEART");

        // When
        Response hundred = authenticated(author).get("/notifications");
        heartsFromNewMembers(post, 100, 100);
        Response overHundred = authenticated(author).get("/notifications");

        // Then
        assertThat(hundred.jsonPath().getString("data.items[0].body"))
                .isEqualTo(latest.getCrewName() + " 외 99명이 좋아요를 눌렀어요.");
        assertThat(overHundred.jsonPath().getString("data.items[0].body"))
                .isEqualTo("회원님의 기록이 무수한 관심을 받고 있어요.");
    }

    private void heartsFromNewMembers(ActivityPost post, int from, int to) {
        jdbc.update("""
                insert into member (crew_name, generation, github_id, member_type, course, created_at, updated_at)
                select 'r' || n, 9, 'heart-' || n, 'CREW', 'BACKEND', ?, ?
                from generate_series(?, ?) as n
                """, NOW, NOW, from, to);
        jdbc.update("""
                insert into activity_post_reaction (activity_post_id, member_id, emoji, created_at, updated_at)
                select ?, id, 'HEART', ?, ? from member where github_id like 'heart-%'
                on conflict do nothing
                """, post.getId(), NOW.minusHours(1), NOW.minusHours(1));
    }

    @Test
    @DisplayName("좋아요가 모두 취소된 알림은 누른 사람 없이 취소됐다고 안내하고 다른 사건의 푸시 내용에는 요약을 넣지 않는다.")
    void cancelledHeartsFallBackToGroupMessage() {
        // Given
        Member author = member("101");
        Member reactor = member("102");
        var subscription = subscription(author, "heart");
        Group group = groups.save(Group.createClub("퇴근 후 독서", "함께 책을 읽어요", null, null, null, NOW.minusDays(10)));
        ActivityPost post = posts.save(ActivityPost.create(group, author, "첫 모임", NOW.toLocalDate(), NOW.minusDays(1)));
        String path = "/activity-posts/" + post.getId() + "/reactions/HEART";
        mutation(reactor).put(path);
        mutation(reactor).delete(path);
        Notification approved = notification(author, "approved");

        // When
        Response inbox = authenticated(author).get("/notifications");
        long heartId = inbox.jsonPath().getLong("data.items.find { it.eventType == 'ACTIVITY_POST_REACTED' }.id");
        Response heartContent = authenticated(author).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", subscription.getGeneration()).get("/notifications/" + heartId + "/push-content");
        Response approvedContent = authenticated(author).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", subscription.getGeneration()).get("/notifications/" + approved.getId() + "/push-content");

        // Then
        assertThat(inbox.jsonPath().getString("data.items.find { it.eventType == 'ACTIVITY_POST_REACTED' }.body"))
                .isEqualTo("‘퇴근 후 독서’ 모임 활동 기록의 좋아요가 모두 취소되었습니다.");
        assertThat(heartContent.jsonPath().getMap("data")).doesNotContainKey("reactionSummary");
        assertThat(approvedContent.jsonPath().getMap("data")).doesNotContainKey("reactionSummary");
    }

    private RequestSpecification mutation(Member member) {
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");
        return authenticated(member).cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf);
    }
}
