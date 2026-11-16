package com.project.jarihana.groupmusic.stream;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static com.project.jarihana.support.TestSupportConfig.FIXED_NOW;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.RestAssured;
import io.restassured.path.json.JsonPath;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalTime;
import java.util.Set;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

class GroupMusicStreamTest extends IntegrationTestSupport {
    @Autowired MemberRepository members;
    @Autowired GroupJpaRepository groups;
    @Autowired GroupMemberJpaRepository memberships;
    @Autowired AccessTokenProvider tokens;
    @Autowired AuthCookieProperties cookies;
    @Autowired JdbcTemplate jdbc;
    @Autowired ApplicationEventPublisher publisher;
    @Autowired PlatformTransactionManager transactions;
    @Autowired GroupMusicStreams streams;
    private Member leader;
    private Group group;

    @BeforeEach
    void fixtures() {
        leader = members.save(Member.create("음악리더", 8, "music-stream-leader", Course.BACKEND));
        group = groups.save(Group.createStudy("음악 스트림", "함께 들어요", null, null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.MONDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)), FIXED_NOW));
        memberships.save(GroupMember.createLeader(group, leader, FIXED_NOW));
    }

    @Test
    @DisplayName("공개 음악 스트림은 초기 revision과 버퍼링 방지 헤더를 반환한다")
    void publicStreamReturnsInitialRevisionAndNoBufferingHeaders() throws Exception {
        // Given / When
        try (MusicStream stream = openStream()) {
            // Then
            JsonPath initial = stream.next();
            assertThat(initial.getLong("revision")).isZero();
            assertThat(initial.getLong("playbackRevision")).isZero();
            assertThat(initial.getMap("$")).hasSize(2);
        }
        given().get("/groups/999999999/music/events").then().statusCode(404);
    }

    @Test
    @DisplayName("변경이 없어도 연결을 유지하고 재접속하면 현재 revision을 전달한다")
    void heartbeatDoesNotRepeatChangesAndReconnectReturnsCurrentRevision() throws Exception {
        // Given
        try (MusicStream stream = openStream()) {
            assertThat(stream.next().getLong("revision")).isZero();
            // When: initial refresh and the next scheduled recovery both keep the connection alive.
            assertThat(stream.heartbeats.poll(8, TimeUnit.SECONDS)).isNotNull();
            assertThat(stream.heartbeats.poll(8, TimeUnit.SECONDS)).isNotNull();
            // Then
            assertThat(stream.events.poll(150, TimeUnit.MILLISECONDS)).isNull();
        }
        saveMusic(0);
        try (MusicStream reconnected = openStream()) {
            assertThat(reconnected.next().getLong("revision")).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("커밋된 음악 변경을 두 청취자에게 즉시 알린다")
    void committedMusicChangeNotifiesBothListenersImmediately() throws Exception {
        // Given
        saveMusic(0);
        try (MusicStream first = openStream(); MusicStream second = openStream()) {
            assertThat(first.next().getLong("revision")).isEqualTo(1);
            assertThat(second.next().getLong("revision")).isEqualTo(1);
            // When
            saveMusic(1);
            // Then: below the 5-second recovery interval, this must be the commit notification.
            assertThat(first.next(2).getLong("revision")).isEqualTo(2);
            assertThat(second.next(2).getLong("revision")).isEqualTo(2);
        }
    }

    @Test
    @DisplayName("다른 서버의 DB 변경도 그룹별 복구 조회로 전달한다")
    void recoversChangesWithoutLocalApplicationEvent() throws Exception {
        // Given
        saveMusic(0);
        try (MusicStream stream = openStream()) {
            assertThat(stream.next().getLong("revision")).isEqualTo(1);
            // When: emulates a commit on a different application process.
            jdbc.update("UPDATE group_music SET revision=revision+1 WHERE group_id=?", group.getId());
            // Then
            assertThat(stream.next().getLong("revision")).isEqualTo(2);
            assertThat(stream.events.poll(150, TimeUnit.MILLISECONDS)).isNull();
        }
    }

    @Test
    @DisplayName("롤백과 늦게 도착한 과거 revision은 청취자에게 전달하지 않는다")
    void ignoresRolledBackAndOutOfOrderChanges() throws Exception {
        // Given
        saveMusic(0);
        try (MusicStream stream = openStream()) {
            stream.next();
            // When
            new TransactionTemplate(transactions).executeWithoutResult(transaction -> {
                publisher.publishEvent(new GroupMusicChanged(group.getId(), 9, 9));
                transaction.setRollbackOnly();
            });
            streams.changed(new GroupMusicChanged(group.getId(), 0, 0));
            // Then
            assertThat(stream.events.poll(200, TimeUnit.MILLISECONDS)).isNull();
            saveMusic(1);
            assertThat(stream.next(2).getLong("revision")).isEqualTo(2);
        }
    }

    @Test
    @DisplayName("모임이 삭제되면 열려 있는 스트림을 종료한다")
    void closesStreamAfterGroupDeletion() throws Exception {
        // Given
        try (MusicStream stream = openStream()) {
            stream.next();
            // When
            jdbc.update("DELETE FROM group_member WHERE group_id=?", group.getId());
            jdbc.update("DELETE FROM groups WHERE id=?", group.getId());
            // Then
            assertThat(stream.ended.await(8, TimeUnit.SECONDS)).isTrue();
        }
    }

    private void saveMusic(long revision) {
        String csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        given().cookie(cookies.accessTokenName(), tokens.issue(leader.getId()).value())
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf).contentType("application/json")
                .body("""
                        {"music":{"enabled":true,"autoplay":true,"title":"함께 듣기 %d",
                        "url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"},"expectedRevision":%d}
                        """.formatted(revision, revision))
                .put("/groups/" + group.getId() + "/music").then().statusCode(200);
    }

    private MusicStream openStream() throws Exception {
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        HttpRequest request = HttpRequest.newBuilder().uri(URI.create("http://localhost:" + RestAssured.port
                + RestAssured.basePath + "/groups/" + group.getId() + "/music/events"))
                .header("Accept", "text/event-stream").GET().build();
        HttpResponse<InputStream> response = client.sendAsync(request, HttpResponse.BodyHandlers.ofInputStream()).get(5, TimeUnit.SECONDS);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Type").orElse("")).startsWith("text/event-stream");
        assertThat(response.headers().firstValue("Cache-Control").orElse("")).contains("no-cache", "no-transform");
        assertThat(response.headers().firstValue("X-Accel-Buffering").orElse("")).isEqualTo("no");
        return new MusicStream(client, response.body());
    }

    private static final class MusicStream implements AutoCloseable {
        private final HttpClient client;
        private final InputStream input;
        private final BlockingQueue<JsonPath> events = new LinkedBlockingQueue<>();
        private final BlockingQueue<String> heartbeats = new LinkedBlockingQueue<>();
        private final Thread reader;
        private final CountDownLatch ended = new CountDownLatch(1);
        private volatile Exception failure;
        private volatile boolean closed;

        private MusicStream(HttpClient client, InputStream input) {
            this.client = client;
            this.input = input;
            reader = Thread.ofVirtual().start(this::readEvents);
        }

        private void readEvents() {
            try (var lines = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
                String event = "";
                StringBuilder data = new StringBuilder();
                String line;
                while ((line = lines.readLine()) != null) {
                    if (line.isEmpty()) {
                        if (event.equals("change") && !data.isEmpty()) events.add(new JsonPath(data.toString()));
                        event = "";
                        data = new StringBuilder();
                    } else if (line.startsWith("event:")) event = line.substring(6).stripLeading();
                    else if (line.startsWith("data:")) data.append(line.substring(5).stripLeading());
                    else if (line.startsWith(":keepalive")) heartbeats.add(line);
                }
            } catch (Exception exception) {
                if (!closed) failure = exception;
            } finally {
                ended.countDown();
            }
        }

        private JsonPath next() throws InterruptedException { return next(8); }

        private JsonPath next(int seconds) throws InterruptedException {
            JsonPath event = events.poll(seconds, TimeUnit.SECONDS);
            assertThat(event).withFailMessage("No change event; reader failure: %s", failure).isNotNull();
            return event;
        }

        @Override
        public void close() throws Exception {
            closed = true;
            input.close();
            reader.interrupt();
            reader.join(2000);
            client.shutdownNow();
        }
    }
}
