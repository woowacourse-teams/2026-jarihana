package com.project.jarihana.notification;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.chat.command.service.ChatCommandService;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;
import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.notificationdelivery.command.repository.PushDeliveryWorkRepository;
import com.project.jarihana.notificationdelivery.command.service.PushDeliveryLeaseService;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import com.project.jarihana.pushsubscription.domain.PushSubscription;
import io.restassured.RestAssured;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatMessageNotificationTest extends NotificationIntegrationTestSupport {
    @Autowired private ChatCommandService chats;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private AccessTokenProvider tokens;
    @Autowired private AuthCookieProperties cookies;
    @Autowired private NotificationDeliveryCommandRepository deliveries;
    @Autowired private PushDeliveryWorkRepository work;
    @Autowired private PushDeliveryLeaseService leases;

    @Test
    @DisplayName("새 채팅은 보낸 사람과 탈퇴 회원을 제외한 현재 모임원에게만 한 번 알린다")
    void notifiesCurrentRecipientsOnceAndPreservesMessagePrivacy() {
        // Given
        Member sender = member("301");
        Member recipient = member("302");
        Member withdrawn = member("303");
        member("304");
        Group group = room(sender, recipient, withdrawn);
        jdbc.update("update member set withdrawn_at = ? where id = ?", NOW, withdrawn.getId());
        UUID requestId = UUID.randomUUID();
        // When
        var first = chats.sendMessage(sender.getId(), group.getId(), requestId, "비공개 채팅 본문");
        var retry = chats.sendMessage(sender.getId(), group.getId(), requestId, "비공개 채팅 본문");
        // Then
        assertThat(first.created()).isTrue();
        assertThat(retry.created()).isFalse();
        assertThat(jdbc.queryForList("select member_id from notifications where event_type = 'CHAT_MESSAGE_RECEIVED'", Long.class))
                .containsExactly(recipient.getId());
        assertThat(jdbc.queryForObject("select event_key from notifications", String.class))
                .isEqualTo("chat-message:" + first.message().id() + ":created");
        assertThat(jdbc.queryForObject("select payload::text from notifications", String.class))
                .doesNotContain("비공개", "content", "sender");
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Long.class)).isZero();
    }

    @Test
    @DisplayName("채팅 푸시는 수신자의 활성 버전 3 구독마다 전송 작업을 만든다")
    void queuesOnlyCapableRecipientDevices() {
        // Given
        Member sender = member("305");
        Member recipient = member("306");
        Member outsider = member("307");
        Group group = room(sender, recipient);
        var first = capableSubscription(recipient, "chat-first");
        var second = capableSubscription(recipient, "chat-second");
        subscription(recipient, "chat-legacy");
        var announcementOnly = subscription(recipient, "chat-v2");
        jdbc.update("update push_subscriptions set client_version = 2 where id = ?", announcementOnly.getId());
        var disabled = capableSubscription(recipient, "chat-disabled");
        subscriptions.save(disabled.disable(NOW));
        capableSubscription(sender, "chat-sender");
        capableSubscription(outsider, "chat-outsider");
        // When
        chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "새 메시지");
        // Then
        assertThat(jdbc.queryForList("select push_subscription_id from notification_deliveries order by push_subscription_id", Long.class))
                .containsExactly(first.getId(), second.getId());
    }

    @Test
    @DisplayName("채팅 트랜잭션이 롤백되면 메시지와 알림 및 전송 작업을 남기지 않는다")
    void rollbackLeavesNoMessageNotificationOrDelivery() {
        // Given
        Member sender = member("308");
        Member recipient = member("309");
        Group group = room(sender, recipient);
        capableSubscription(recipient, "chat-rollback");
        // When
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "취소");
            status.setRollbackOnly();
        });
        // Then
        assertThat(jdbc.queryForObject("select count(*) from chat_message", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notifications", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Long.class)).isZero();
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2})
    @DisplayName("이전 클라이언트는 채팅 알림을 조회하거나 전체 읽음으로 처리하지 않는다")
    void hidesChatFromOlderClients(int version) {
        // Given
        Member sender = member("310");
        Member recipient = member("311");
        Group group = room(sender, recipient);
        var subscription = capableSubscription(recipient, "chat-compatibility");
        chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "내용");
        long id = jdbc.queryForObject("select id from notifications", Long.class);
        // When / Then
        var page = authenticated(recipient).queryParam("clientVersion", version).get("/notifications");
        assertThat(page.statusCode()).isEqualTo(200);
        assertThat(page.jsonPath().getList("data.items")).isEmpty();
        assertThat(authenticated(recipient).queryParam("clientVersion", version).get("/notifications/unread-count")
                .jsonPath().getLong("data.unreadCount")).isZero();
        assertThat(authenticated(recipient).queryParam("clientVersion", version).get("/notifications/" + id).statusCode()).isEqualTo(404);
        assertThat(authenticated(recipient).queryParam("clientVersion", version).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", subscription.getGeneration()).get("/notifications/" + id + "/push-content").statusCode()).isEqualTo(404);
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");
        var read = authenticated(recipient).cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .queryParam("clientVersion", version).patch("/notifications/read-all");
        assertThat(read.statusCode()).isEqualTo(200);
        assertThat(read.jsonPath().getLong("data.updatedCount")).isZero();
        assertThat(jdbc.queryForObject("select read_at from notifications where id = ?", Object.class, id)).isNull();
        var detail = authenticated(recipient).queryParam("clientVersion", 3).get("/notifications/" + id);
        assertThat(detail.statusCode()).isEqualTo(200);
        assertThat(detail.jsonPath().getString("data.target.kind")).isEqualTo("GROUP_CHAT");
        assertThat(detail.jsonPath().getLong("data.target.groupId")).isEqualTo(group.getId());
        assertThat(detail.jsonPath().getString("data.title")).isEqualTo("새 메시지");
        assertThat(authenticated(recipient).queryParam("clientVersion", 3).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", subscription.getGeneration()).get("/notifications/" + id + "/push-content")
                .jsonPath().getMap("data.payload")).containsOnlyKeys("groupId");
        var currentRead = authenticated(recipient).cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .queryParam("clientVersion", 3).patch("/notifications/read-all");
        assertThat(currentRead.statusCode()).isEqualTo(200);
        assertThat(currentRead.jsonPath().getLong("data.updatedCount")).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    @DisplayName("구독이 선점 전후에 이전 버전으로 바뀌면 채팅 전송을 취소한다")
    void cancelsChatAfterSubscriptionDowngrade(boolean afterClaim) {
        // Given
        Member sender = member("312");
        Member recipient = member("313");
        Group group = room(sender, recipient);
        var subscription = capableSubscription(recipient, "chat-downgrade");
        chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "내용");
        long deliveryId = jdbc.queryForObject("select id from notification_deliveries", Long.class);
        // When
        if (!afterClaim) jdbc.update("update push_subscriptions set client_version = 2 where id = ?", subscription.getId());
        var claims = new TransactionTemplate(transactions).execute(status -> work.claimNext(NOW, NOW.plusMinutes(1), 10));
        if (afterClaim) jdbc.update("update push_subscriptions set client_version = 2 where id = ?", subscription.getId());
        var prepared = leases.prepare(claims);
        // Then
        assertThat(prepared).isEmpty();
        assertThat(deliveries.findById(deliveryId).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.CANCELLED);
    }

    @Test
    @DisplayName("채팅 전송 HTTP 요청과 재시도는 수신자별 알림 및 전송 작업을 하나만 남긴다")
    void httpSendAndRetryQueueOneDelivery() {
        // Given
        Member sender = member("314");
        Member recipient = member("315");
        Group group = room(sender, recipient);
        capableSubscription(recipient, "chat-http");
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");
        Map<String, String> body = Map.of("clientMessageId", UUID.randomUUID().toString(), "content", "HTTP 채팅");
        // When
        var created = authenticated(sender).cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json").body(body).post("/groups/{groupId}/chat/messages", group.getId());
        var retried = authenticated(sender).cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json").body(body).post("/groups/{groupId}/chat/messages", group.getId());
        // Then
        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(retried.statusCode()).isEqualTo(200);
        assertThat(retried.jsonPath().getString("data.id")).isEqualTo(created.jsonPath().getString("data.id"));
        assertThat(jdbc.queryForObject("select count(*) from notifications", Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Long.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("알림 저장이 실패하면 이미 저장한 채팅과 순번 및 전송 작업도 롤백한다")
    void notificationFailureRollsBackChatTransaction() {
        // Given
        Member sender = member("316");
        Member recipient = member("317");
        Group group = room(sender, recipient);
        capableSubscription(recipient, "chat-fault");
        // When / Then
        assertThatThrownBy(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
            jdbc.execute("alter table notifications add constraint test_reject_chat check (event_type <> 'CHAT_MESSAGE_RECEIVED') not valid");
            chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "실패");
        })).isInstanceOf(RuntimeException.class);
        assertThat(jdbc.queryForObject("select count(*) from chat_message", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notifications", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Long.class)).isZero();
        assertThat(chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "복구").message().sequence()).isEqualTo(1);
    }

    private Group room(Member sender, Member... recipients) {
        Group group = groups.save(Group.createClub("채팅알림" + sender.getId(), "소개", null, null, null, NOW));
        groupMembers.save(GroupMember.createLeader(group, sender, NOW));
        for (Member recipient : recipients) groupMembers.save(GroupMember.createMember(group, recipient, NOW));
        return group;
    }

    private PushSubscription capableSubscription(Member member, String suffix) {
        var subscription = subscription(member, suffix);
        return subscriptions.save(subscription.reconnect(subscription.getP256dh(), subscription.getAuth(), 3, NOW));
    }

    private RequestSpecification authenticated(Member member) {
        return RestAssured.given().cookie(cookies.accessTokenName(), tokens.issue(member.getId()).value());
    }
}
