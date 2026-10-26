package com.project.jarihana.chat;

import static io.restassured.RestAssured.given;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

import com.project.jarihana.auth.config.JwtProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.chat.client.ChatEventDispatcher;
import com.project.jarihana.chat.client.ChatPostgresListener;
import com.project.jarihana.chat.command.service.ChatCommandService;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import io.restassured.RestAssured;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.user.SimpUserRegistry;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.Date;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

class ChatWebSocketTest extends NotificationIntegrationTestSupport {
    @Autowired AccessTokenProvider tokens;
    @Autowired JwtProperties jwt;
    @Autowired Clock clock;
    @Autowired ChatCommandService commands;
    @Autowired ChatPostgresListener listener;
    @Autowired SimpUserRegistry registry;
    @Autowired ChatEventDispatcher dispatcher;

    @Test
    @DisplayName("지연된 읽음 이벤트는 이후 커밋된 메시지까지의 미읽음 스냅샷 순번을 제공한다")
    void delayedReadEventIncludesCountWatermark() throws Exception {
        Member owner = member("308");
        Member participant = member("309");
        Group group = room(owner);
        groupMembers.save(GroupMember.createMember(group, participant, NOW));
        try (Socket receiver = connect(participant, true)) {
            receiver.subscribe("/user/queue/chat-events");
            await().atMost(Duration.ofSeconds(5)).until(() -> subscribed(participant));
            listener.stop();
            commands.sendMessage(owner.getId(), group.getId(), UUID.randomUUID(), "첫 메시지");
            var read = commands.markRead(participant.getId(), group.getId(), 1);
            assertThat(read.latestSequence()).isEqualTo(1);
            assertThat(read.unreadCount()).isZero();
            commands.sendMessage(owner.getId(), group.getId(), UUID.randomUUID(), "늦은 메시지");
            receiver.frames.clear();
            dispatcher.dispatch(
                    "{\"version\":1,\"type\":\"READ_STATE_UPDATED\",\"groupId\":"
                            + group.getId()
                            + ",\"memberId\":"
                            + participant.getId()
                            + "}");
            assertThat(receiver.frames.poll(5, TimeUnit.SECONDS))
                    .contains(
                            "\"lastReadSequence\":\"1\"",
                            "\"latestSequence\":\"2\"",
                            "\"unreadCount\":1");
            listener.start();
            assertThat(receiver.frames.poll(5, TimeUnit.SECONDS)).contains("RESYNC_REQUIRED");
        } finally {
            listener.start();
        }
    }

    @Test
    @DisplayName("인증된 개인 구독에 커밋된 메시지를 전달하고 미가입 접속자는 제외한다")
    void deliversCommittedMessagesOnlyToCurrentMembers() throws Exception {
        Member owner = member("301");
        Member participant = member("302");
        Member outsider = member("303");
        Group group = room(owner);
        groupMembers.save(GroupMember.createMember(group, participant, NOW));
        try (Socket receiver = connect(participant, true);
                Socket excluded = connect(outsider, true)) {
            receiver.subscribe("/user/queue/chat-events");
            excluded.subscribe("/user/queue/chat-events");
            await().atMost(Duration.ofSeconds(5))
                    .until(() -> subscribed(participant) && subscribed(outsider));
            await().atMost(Duration.ofSeconds(5))
                    .until(() -> listener.health().getStatus().getCode().equals("UP"));
            commands.sendMessage(owner.getId(), group.getId(), UUID.randomUUID(), "실시간 확인");
            String event = receiver.frames.poll(5, TimeUnit.SECONDS);
            assertThat(event).contains("MESSAGE", "MESSAGE_CREATED", "실시간 확인");
            assertThat(excluded.frames.poll(300, TimeUnit.MILLISECONDS)).isNull();
        }
    }

    @Test
    @DisplayName("다른 경로 구독과 클라이언트 SEND는 오류로 거부한다")
    void rejectsBrokerSubscriptionsAndAllClientSends() throws Exception {
        Member owner = member("304");
        for (String destination :
                new String[] {"/queue/chat-events", "/topic/chat", "/user/999/queue/chat-events"}) {
            try (Socket socket = connect(owner, true)) {
                socket.subscribe(destination);
                assertThat(socket.frames.poll(5, TimeUnit.SECONDS)).contains("ERROR");
            }
        }
        try (Socket socket = connect(owner, true)) {
            socket.send("SEND\ndestination:/user/queue/chat-events\n\nforged\0");
            assertThat(socket.frames.poll(5, TimeUnit.SECONDS)).contains("ERROR");
        }
    }

    @Test
    @DisplayName("CONNECT CSRF 누락과 허용하지 않은 Origin은 연결을 거부한다")
    void rejectsMissingCsrfAndCrossOriginHandshake() throws Exception {
        Member owner = member("305");
        String token = tokens.issue(owner.getId()).value();
        String csrf = csrf(token);
        try (Socket socket = open(token, csrf, "http://localhost:5173")) {
            socket.send("CONNECT\naccept-version:1.2\nhost:localhost\n\n\0");
            assertThat(socket.frames.poll(5, TimeUnit.SECONDS)).contains("ERROR");
        }
        assertThatThrownBy(() -> open(token, csrf, "https://untrusted.example"))
                .isInstanceOf(Exception.class);
        assertThatThrownBy(() -> open("", csrf, "http://localhost:5173"))
                .isInstanceOf(Exception.class);
    }

    @Test
    @DisplayName("만료된 인증 소켓은 서버에서 닫는다")
    void closesSocketAtTokenExpiry() throws Exception {
        Member owner = member("306");
        String token =
                Jwts.builder()
                        .subject(owner.getId().toString())
                        .issuedAt(Date.from(clock.instant()))
                        .expiration(Date.from(clock.instant().plusSeconds(2)))
                        .signWith(Keys.hmacShaKeyFor(jwt.secret().getBytes(StandardCharsets.UTF_8)))
                        .compact();
        String csrf = csrf(token);
        try (Socket socket = open(token, csrf, "http://localhost:5173")) {
            socket.send(
                    "CONNECT\naccept-version:1.2\nhost:localhost\nX-XSRF-TOKEN:" + csrf + "\n\n\0");
            assertThat(socket.frames.poll(5, TimeUnit.SECONDS)).contains("CONNECTED");
            assertThat(socket.closed.get(5, TimeUnit.SECONDS)).isEqualTo(1008);
        }
    }

    private boolean subscribed(Member member) {
        var user = registry.getUser(member.getId().toString());
        return user != null
                && user.getSessions().stream()
                        .anyMatch(session -> !session.getSubscriptions().isEmpty());
    }

    @Test
    @DisplayName("CONNECT 없이 구독하여 CSRF 검증을 건너뛸 수 없다")
    void rejectsSubscriptionBeforeConnect() throws Exception {
        Member owner = member("307");
        String token = tokens.issue(owner.getId()).value();
        try (Socket socket = open(token, csrf(token), "http://localhost:5173")) {
            socket.subscribe("/user/queue/chat-events");
            assertThat(socket.frames.poll(2, TimeUnit.SECONDS)).contains("ERROR");
        }
    }

    private Group room(Member owner) {
        Group group =
                groups.save(Group.createClub("소켓" + owner.getId(), "소개", null, null, null, NOW));
        groupMembers.save(GroupMember.createLeader(group, owner, NOW));
        return group;
    }

    private Socket connect(Member owner, boolean validCsrf) throws Exception {
        String token = tokens.issue(owner.getId()).value();
        String csrf = csrf(token);
        Socket socket = open(token, csrf, "http://localhost:5173");
        socket.send(
                "CONNECT\naccept-version:1.2\nhost:localhost\nX-XSRF-TOKEN:"
                        + (validCsrf ? csrf : "invalid")
                        + "\n\n\0");
        assertThat(socket.frames.poll(5, TimeUnit.SECONDS)).contains("CONNECTED");
        return socket;
    }

    private String csrf(String token) {
        return given().cookie("accessToken", token).get("/members/me").cookie("XSRF-TOKEN");
    }

    private Socket open(String token, String csrf, String origin) throws Exception {
        Socket socket = new Socket();
        socket.connection =
                HttpClient.newHttpClient()
                        .newWebSocketBuilder()
                        .header("Origin", origin)
                        .header("Cookie", "accessToken=" + token + "; XSRF-TOKEN=" + csrf)
                        .connectTimeout(Duration.ofSeconds(5))
                        .buildAsync(
                                URI.create("ws://localhost:" + RestAssured.port + "/api/ws/chat"),
                                socket)
                        .get(5, TimeUnit.SECONDS);
        return socket;
    }

    private static final class Socket implements WebSocket.Listener, AutoCloseable {
        private final BlockingQueue<String> frames = new LinkedBlockingQueue<>();
        private final CompletableFuture<Integer> closed = new CompletableFuture<>();
        private final StringBuilder fragments = new StringBuilder();
        private WebSocket connection;

        @Override
        public void onOpen(WebSocket webSocket) {
            webSocket.request(1);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            fragments.append(data);
            if (last) {
                frames.add(fragments.toString());
                fragments.setLength(0);
            }
            webSocket.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(WebSocket webSocket, int status, String reason) {
            closed.complete(status);
            return null;
        }

        @Override
        public void onError(WebSocket webSocket, Throwable failure) {
            closed.completeExceptionally(failure);
        }

        void send(String frame) {
            connection.sendText(frame, true).join();
        }

        void subscribe(String destination) {
            send("SUBSCRIBE\nid:chat\ndestination:" + destination + "\n\n\0");
        }

        @Override
        public void close() {
            if (connection != null) connection.abort();
        }
    }
}
