package com.project.jarihana.sparring;

import static io.restassured.RestAssured.given;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;

import io.restassured.RestAssured;
import io.restassured.path.json.JsonPath;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import java.io.BufferedReader;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;

import javax.sql.DataSource;

class SparringAcceptanceTest extends IntegrationTestSupport {
    @Autowired MemberRepository members;
    @Autowired AccessTokenProvider tokens;
    @Autowired AuthCookieProperties cookies;
    @Autowired DataSource dataSource;

    @Test
    @DisplayName("마감 일시를 저장하고 마감 이후 투표와 새 메시지를 거절한다")
    void storesDeadlineAndRejectsParticipationAfterClosing() {
        // Given
        String token = member("마감", "deadline");
        long id =
                request(token)
                        .body(
                                Map.of(
                                        "title",
                                        "마감 토론",
                                        "a",
                                        "찬성",
                                        "b",
                                        "반대",
                                        "closesAt",
                                        "2099-01-01T00:00:00Z"))
                        .post("/sparrings")
                        .then()
                        .statusCode(201)
                        .extract()
                        .jsonPath()
                        .getLong("data.id");
        given().get("/sparrings/" + id)
                .then()
                .statusCode(200)
                .body("data.closesAt", equalTo("2099-01-01T09:00:00+09:00"));
        request(token)
                .body(Map.of("side", "MINT"))
                .post("/sparrings/" + id + "/votes")
                .then()
                .statusCode(204);
        // When
        new JdbcTemplate(dataSource)
                .update(
                        "update sparring_topic set closes_at = timestamp '2000-01-01 00:00:00'"
                                + " where id = ?",
                        id);
        // Then
        request(token)
                .body(Map.of("side", "CORAL"))
                .post("/sparrings/" + id + "/votes")
                .then()
                .statusCode(409);
        post(token, id, "마감 후 메시지", null, UUID.randomUUID()).then().statusCode(409);
        given().get("/sparrings/" + id)
                .then()
                .statusCode(200)
                .body("data.votesA", equalTo(1))
                .body("data.postCount", equalTo(0));
    }

    @Test
    @DisplayName("진행 및 마감 주제를 의견 여부와 커서로 조회한다")
    void filtersOpenAndClosedTopicsAcrossPages() {
        String token = member("목록", "sparring-filter-deadline");
        createTopic(token);
        long openActive = createTopic(token);
        long closed = createTopic(token);
        long closedActive = createTopic(token);
        for (long id : new long[] {openActive, closedActive}) {
            request(token)
                    .body(Map.of("side", "MINT"))
                    .post("/sparrings/" + id + "/votes")
                    .then()
                    .statusCode(204);
            post(token, id, "의견", null, UUID.randomUUID()).then().statusCode(201);
        }
        new JdbcTemplate(dataSource)
                .update(
                        "update sparring_topic set closes_at = timestamp '2000-01-01 00:00:00'"
                            + " where id in (?, ?)",
                        closed,
                        closedActive);
        given().queryParam("keyword", "점심")
                .queryParam("filter", "open")
                .get("/sparrings")
                .then()
                .statusCode(200)
                .body("data.items", hasSize(2));
        given().queryParam("keyword", "점심")
                .queryParam("filter", "open_active")
                .get("/sparrings")
                .then()
                .statusCode(200)
                .body("data.items", hasSize(1))
                .body("data.items[0].id", equalTo((int) openActive));
        given().queryParam("keyword", "점심")
                .queryParam("filter", "closed_active")
                .get("/sparrings")
                .then()
                .statusCode(200)
                .body("data.items", hasSize(1))
                .body("data.items[0].id", equalTo((int) closedActive));
        String cursor =
                given().queryParam("keyword", "점심")
                        .queryParam("filter", "closed")
                        .queryParam("size", 1)
                        .get("/sparrings")
                        .then()
                        .statusCode(200)
                        .body("data.items[0].id", equalTo((int) closedActive))
                        .body("data.hasNext", equalTo(true))
                        .extract()
                        .path("data.nextCursor");
        given().queryParam("keyword", "점심")
                .queryParam("filter", "closed")
                .queryParam("size", 1)
                .queryParam("cursor", cursor)
                .get("/sparrings")
                .then()
                .statusCode(200)
                .body("data.items[0].id", equalTo((int) closed))
                .body("data.hasNext", equalTo(false));
    }

    @Test
    @DisplayName("토론 생성 시 마감 일시를 생략하거나 null로 지정할 수 없다")
    void requiresDeadlineOnCreation() {
        String token = member("필수", "required-deadline");
        request(token)
                .body(Map.of("title", "마감 토론", "a", "찬성", "b", "반대"))
                .post("/sparrings")
                .then()
                .statusCode(400);
        request(token)
                .body("{\"title\":\"마감 토론\",\"a\":\"찬성\",\"b\":\"반대\",\"closesAt\":null}")
                .post("/sparrings")
                .then()
                .statusCode(400);
    }

    @Test
    @DisplayName("기존 마감 없는 토론은 조회하고 참여할 수 있다")
    void preservesExistingTopicWithoutDeadline() {
        String token = member("기존", "legacy-deadline");
        long id = createTopic(token);
        new JdbcTemplate(dataSource)
                .update("update sparring_topic set closes_at = null where id = ?", id);
        given().get("/sparrings/" + id).then().statusCode(200).body("data.closesAt", nullValue());
        request(token)
                .body(Map.of("side", "MINT"))
                .post("/sparrings/" + id + "/votes")
                .then()
                .statusCode(204);
    }

    @Test
    @DisplayName("과거 마감 일시로 토론을 만들 수 없다")
    void rejectsPastDeadline() {
        // Given
        String token = member("과거", "past-deadline");
        // When / Then
        request(token)
                .body(
                        Map.of(
                                "title",
                                "마감 토론",
                                "a",
                                "찬성",
                                "b",
                                "반대",
                                "closesAt",
                                "2000-01-01T00:00:00Z"))
                .post("/sparrings")
                .then()
                .statusCode(400);
    }

    @Test
    @DisplayName("기존 스파링 테이블이 있어도 Flyway 스키마 적용은 기존 주제를 보존한다")
    void migrationPreservesExistingSparringData() {
        // Given
        String token = member("가온", "sparring-migration");
        long id = createTopic(token);

        // When
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V14__sparring.sql"))
                .execute(dataSource);

        // Then
        given().get("/sparrings/" + id)
                .then()
                .statusCode(200)
                .body("data.title", equalTo("점심 20분 기다릴까?"));
    }

    @Test
    @DisplayName("주제를 등록하면 비회원도 목록과 빈 경기장을 조회한다")
    void createsAndReadsTopic() {
        // Given
        String token = member("가온", "sparring-create");
        // When
        long id = createTopic(token);
        // Then
        given().get("/sparrings").then().statusCode(200).body("data.items", hasSize(1));
        given().get("/sparrings/" + id)
                .then()
                .statusCode(200)
                .body("data.title", equalTo("점심 20분 기다릴까?"))
                .body("data.votesA", equalTo(0))
                .body("data.mySide", nullValue());
    }

    @Test
    @DisplayName("편을 바꿔도 한 표이며 여러 의견을 보내도 투표 수는 늘지 않는다")
    void changesSideWithoutDuplicatingVote() {
        // Given
        String token = member("나래", "sparring-vote");
        long id = createTopic(token);
        request(token)
                .body(Map.of("side", "MINT"))
                .post("/sparrings/" + id + "/votes")
                .then()
                .statusCode(204);
        request(token)
                .body(Map.of("side", "CORAL"))
                .post("/sparrings/" + id + "/votes")
                .then()
                .statusCode(204);
        // When
        post(token, id, "시간이 더 소중해", null, UUID.randomUUID()).then().statusCode(201);
        post(token, id, "줄 없는 곳으로 가자", null, UUID.randomUUID()).then().statusCode(201);
        // Then
        request(token)
                .get("/sparrings/" + id)
                .then()
                .statusCode(200)
                .body("data.votesA", equalTo(0))
                .body("data.votesB", equalTo(1))
                .body("data.postCount", equalTo(2))
                .body("data.mySide", equalTo("CORAL"));
    }

    @Test
    @DisplayName("편 선택 전 의견은 거절하고 재전송한 의견은 한 번만 저장한다")
    void requiresVoteAndDeduplicatesRetry() {
        // Given
        String token = member("다온", "sparring-retry");
        long id = createTopic(token);
        UUID requestId = UUID.randomUUID();
        post(token, id, "맛있으면 기다려", null, requestId).then().statusCode(409);
        request(token).body(Map.of("side", "MINT")).post("/sparrings/" + id + "/votes");
        // When
        post(token, id, "맛있으면 기다려", null, requestId).then().statusCode(201);
        post(token, id, "맛있으면 기다려", null, requestId).then().statusCode(201);
        // Then
        given().get("/sparrings/" + id + "/posts")
                .then()
                .statusCode(200)
                .body("data.items", hasSize(1))
                .body("data.hasNext", equalTo(false));
    }

    @Test
    @DisplayName("다른 주제 의견에는 받아칠 수 없고 같은 주제의 원문은 보존된다")
    void rejectsCrossTopicReply() {
        // Given
        String token = member("라온", "sparring-reply");
        long first = createTopic(token), second = createTopic(token);
        for (long id : new long[] {first, second}) {
            request(token).body(Map.of("side", "MINT")).post("/sparrings/" + id + "/votes");
        }
        long parent =
                post(token, first, "원래 주장", null, UUID.randomUUID()).jsonPath().getLong("data.id");
        // When / Then
        post(token, second, "다른 주제 반박", parent, UUID.randomUUID()).then().statusCode(400);
        post(token, first, "같은 주제 반박", parent, UUID.randomUUID()).then().statusCode(201);
        given().get("/sparrings/" + first + "/posts")
                .then()
                .statusCode(200)
                .body("data.items[0].replyTo.text", equalTo("원래 주장"));
    }

    @Test
    @DisplayName("글 작성 시 진영을 보존하고 커서로 이전 글과 재접속 후 새 글을 조회한다")
    void paginatesAndPreservesPostSide() {
        // Given
        String token = member("마루", "sparring-history");
        long id = createTopic(token);
        request(token).body(Map.of("side", "MINT")).post("/sparrings/" + id + "/votes");
        long first =
                post(token, id, "먼저 보낸 글", null, UUID.randomUUID()).jsonPath().getLong("data.id");
        request(token).body(Map.of("side", "CORAL")).post("/sparrings/" + id + "/votes");
        post(token, id, "바꾼 뒤 보낸 글", null, UUID.randomUUID());
        String cursor =
                given().queryParam("size", 1)
                        .get("/sparrings/" + id + "/posts")
                        .then()
                        .statusCode(200)
                        .body("data.hasNext", equalTo(true))
                        .extract()
                        .path("data.nextCursor");
        // When / Then
        given().queryParam("cursor", cursor)
                .get("/sparrings/" + id + "/posts")
                .then()
                .statusCode(200)
                .body("data.items[0].side", equalTo("MINT"));
        given().queryParam("afterId", first)
                .get("/sparrings/" + id + "/posts")
                .then()
                .statusCode(200)
                .body("data.items", hasSize(1))
                .body("data.items[0].side", equalTo("CORAL"));
    }

    @Test
    @DisplayName("비회원 작성과 CSRF 없는 회원 작성은 거절한다")
    void protectsWrites() {
        // Given
        String token = member("바다", "sparring-auth");
        // When / Then
        request(null).body(topic()).post("/sparrings").then().statusCode(401);
        given().cookie(cookies.accessTokenName(), token)
                .contentType("application/json")
                .body(topic())
                .post("/sparrings")
                .then()
                .statusCode(403);
    }

    @Test
    @DisplayName("빈 경기장의 0번 이후 조회와 잘못된 커서를 검증한다")
    void validatesCursorAndAllowsInitialCatchup() {
        String token = member("초롱", "sparring-validation");
        long id = createTopic(token);
        given().queryParam("afterId", 0)
                .get("/sparrings/" + id + "/posts")
                .then()
                .statusCode(200)
                .body("data.items", hasSize(0));
        String invalid =
                Base64.getUrlEncoder()
                        .encodeToString("bad-date~1".getBytes(StandardCharsets.UTF_8));
        given().queryParam("cursor", invalid).get("/sparrings").then().statusCode(400);
        given().queryParam("size", 101).get("/sparrings").then().statusCode(400);
        given().queryParam("filter", "mine").get("/sparrings").then().statusCode(401);
        given().get("/sparrings/999999/events").then().statusCode(404);
        request(token)
                .body(Map.of("title", " ", "a", "같아", "b", "같아"))
                .post("/sparrings")
                .then()
                .statusCode(400);
    }

    @Test
    @DisplayName("SSE는 최초 revision과 커밋한 투표 revision을 전달하고 재연결 시 현재 값을 보낸다")
    void streamsCommittedRevisions() throws Exception {
        String token = member("새봄", "sparring-sse");
        long id = createTopic(token);
        URI uri =
                URI.create(
                        "http://localhost:"
                                + RestAssured.port
                                + "/api/sparrings/"
                                + id
                                + "/events");
        try (var http = HttpClient.newHttpClient()) {
            var request =
                    HttpRequest.newBuilder(uri).header("Accept", "text/event-stream").GET().build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
            Assertions.assertEquals(200, response.statusCode());
            try (var reader = new BufferedReader(new InputStreamReader(response.body()))) {
                Assertions.assertTimeoutPreemptively(
                        Duration.ofSeconds(8),
                        () -> {
                            Assertions.assertEquals("data:{\"revision\":1}", readData(reader));
                            request(token)
                                    .body(Map.of("side", "MINT"))
                                    .post("/sparrings/" + id + "/votes")
                                    .then()
                                    .statusCode(204);
                            Assertions.assertEquals("data:{\"revision\":2}", readData(reader));
                        });
            }
            var reconnected = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (var reader = new BufferedReader(new InputStreamReader(reconnected.body()))) {
                Assertions.assertTimeoutPreemptively(
                        Duration.ofSeconds(5),
                        () -> Assertions.assertEquals("data:{\"revision\":2}", readData(reader)));
            }
        }
    }

    @Test
    @DisplayName("SSE는 최초 30개와 제한 없는 추가 의견 및 투표수를 전달한다")
    void streamsSnapshotAndAllNewPosts() throws Exception {
        // Given
        String token = member("전달", "sparring-sse-posts");
        long id = createTopic(token);
        request(token)
                .body(Map.of("side", "MINT"))
                .post("/sparrings/" + id + "/votes")
                .then()
                .statusCode(204);
        insertPosts(id, 40);
        var uri =
                URI.create(
                        "http://localhost:"
                                + RestAssured.port
                                + "/api/sparrings/"
                                + id
                                + "/events");
        try (var http = HttpClient.newHttpClient()) {
            var request = HttpRequest.newBuilder(uri).GET().build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (var reader = new BufferedReader(new InputStreamReader(response.body()))) {
                Assertions.assertTimeoutPreemptively(
                        Duration.ofSeconds(12),
                        () -> {
                            var snapshot = readEvent(reader, "snapshot");
                            Assertions.assertEquals(30, snapshot.getList("posts").size());
                            Assertions.assertEquals(40, snapshot.getInt("postCount"));
                            long lastId = snapshot.getLong("posts[29].id");
                            // When: all writes are committed together, as changes made by another
                            // server.
                            insertPosts(id, 1000);
                            var update = readEvent(reader, "update");
                            // Then: HTTP page size and replay retention do not truncate stream
                            // delivery.
                            Assertions.assertEquals(1000, update.getList("posts").size());
                            Assertions.assertEquals(1040, update.getInt("postCount"));
                            Assertions.assertEquals(lastId + 1, update.getLong("posts[0].id"));
                            Assertions.assertEquals(lastId + 1000, update.getLong("posts[999].id"));
                            Assertions.assertFalse(update.getMap("").containsKey("mySide"));
                            request(token)
                                    .body(Map.of("side", "CORAL"))
                                    .post("/sparrings/" + id + "/votes")
                                    .then()
                                    .statusCode(204);
                            var votes = readEvent(reader, "update");
                            Assertions.assertTrue(votes.getList("posts").isEmpty());
                            Assertions.assertEquals(0, votes.getInt("votesA"));
                            Assertions.assertEquals(1, votes.getInt("votesB"));
                        });
            }
            // When / Then: reconnect initializes latest30 even with an old Last-Event-ID.
            var reconnect = HttpRequest.newBuilder(uri).header("Last-Event-ID", "1").GET().build();
            var response2 = http.send(reconnect, HttpResponse.BodyHandlers.ofInputStream());
            try (var reader = new BufferedReader(new InputStreamReader(response2.body()))) {
                Assertions.assertTimeoutPreemptively(
                        Duration.ofSeconds(5),
                        () -> {
                            var snapshot = readEvent(reader, "snapshot");
                            Assertions.assertEquals(30, snapshot.getList("posts").size());
                            Assertions.assertEquals(1040, snapshot.getInt("postCount"));
                            Assertions.assertEquals(1, snapshot.getInt("votesB"));
                        });
            }
        }
    }

    private void insertPosts(long topicId, int count) {
        new JdbcTemplate(dataSource)
                .update(
                        """
                        with inserted as (
                            insert into sparring_post (created_at, updated_at, topic_id, member_id, side, text, request_id)
                            select now(), now(), t.id, t.creator_id, 'MINT', 'stream ' || n, gen_random_uuid()
                            from sparring_topic t cross join generate_series(1, ?) n where t.id = ?
                            returning id
                        ) update sparring_topic set revision = revision + (select count(*) from inserted) where id = ?
                        """,
                        count,
                        topicId,
                        topicId);
    }

    private JsonPath readEvent(BufferedReader reader, String name) throws IOException {
        String event = "";
        String line;
        while ((line = reader.readLine()) != null) {
            if (line.startsWith("event:")) event = line.substring(6);
            if (line.startsWith("data:") && event.equals(name))
                return new JsonPath(line.substring(5));
        }
        throw new EOFException("SSE closed before " + name);
    }

    @Test
    @DisplayName("동시 편 선택과 중복 전송도 한 표와 한 글로 남긴다")
    void serializesConcurrentCommands() throws Exception {
        String token = member("푸름", "sparring-concurrent");
        long id = createTopic(token);
        UUID requestId = UUID.randomUUID();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var votes =
                    IntStream.range(0, 6)
                            .mapToObj(
                                    index ->
                                            executor.submit(
                                                    () ->
                                                            request(token)
                                                                    .body(
                                                                            Map.of(
                                                                                    "side",
                                                                                    index % 2 == 0
                                                                                            ? "MINT"
                                                                                            : "CORAL"))
                                                                    .post(
                                                                            "/sparrings/"
                                                                                    + id
                                                                                    + "/votes")
                                                                    .then()
                                                                    .statusCode(204)))
                            .toList();
            for (var vote : votes) vote.get();
            var submissions =
                    IntStream.range(0, 6)
                            .mapToObj(
                                    index ->
                                            executor.submit(
                                                    () ->
                                                            post(
                                                                            token,
                                                                            id,
                                                                            "겹쳐 보내도 한 번",
                                                                            null,
                                                                            requestId)
                                                                    .then()
                                                                    .statusCode(201)))
                            .toList();
            for (var submission : submissions) submission.get();
        }
        var result =
                request(token).get("/sparrings/" + id).then().statusCode(200).extract().jsonPath();
        Assertions.assertEquals(1, result.getInt("data.votesA") + result.getInt("data.votesB"));
        Assertions.assertEquals(1, result.getInt("data.postCount"));
        post(token, id, "같은 번호 다른 내용", null, requestId).then().statusCode(400);
    }

    private String readData(BufferedReader reader) throws IOException {
        String line;
        String event = "";
        while ((line = reader.readLine()) != null) {
            if (line.startsWith("event:")) event = line.substring(6);
            if (line.startsWith("data:") && event.equals("revision")) return line;
        }
        throw new EOFException("SSE closed before its revision event");
    }

    private String member(String name, String github) {
        Member saved = members.save(Member.create(name, 23, github, Course.BACKEND));
        return tokens.issue(saved.getId()).value();
    }

    private Map<String, String> topic() {
        return Map.of(
                "title",
                "점심 20분 기다릴까?",
                "a",
                "맛있으면 기다려",
                "b",
                "시간이 더 소중해",
                "description",
                "점심시간 이야기",
                "closesAt",
                "2099-01-01T00:00:00Z");
    }

    private long createTopic(String token) {
        return request(token)
                .body(topic())
                .post("/sparrings")
                .then()
                .statusCode(201)
                .extract()
                .jsonPath()
                .getLong("data.id");
    }

    private RequestSpecification request(String token) {
        String csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        RequestSpecification request =
                given().contentType("application/json")
                        .cookie("XSRF-TOKEN", csrf)
                        .header("X-XSRF-TOKEN", csrf);
        return token == null ? request : request.cookie(cookies.accessTokenName(), token);
    }

    private Response post(String token, long id, String text, Long replyTo, UUID requestId) {
        return request(token)
                .body(new PostBody(text, replyTo, requestId))
                .post("/sparrings/" + id + "/posts");
    }

    private record PostBody(String text, Long replyToId, UUID requestId) {}
}
