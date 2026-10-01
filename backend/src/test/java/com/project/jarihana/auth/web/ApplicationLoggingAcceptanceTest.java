package com.project.jarihana.auth.web;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.LoggerContext;
import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.config.JwtProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.CapturedApplicationLogs;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import io.restassured.RestAssured;
import io.restassured.response.Response;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.boot.logging.logback.StructuredLogEncoder;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static com.project.jarihana.support.CapturedApplicationLogs.fields;
import static org.assertj.core.api.Assertions.assertThat;

@Import(ApplicationLoggingAcceptanceTest.FailureController.class)
class ApplicationLoggingAcceptanceTest extends IntegrationTestSupport {

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private JwtProperties jwtProperties;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private GroupMemberJpaRepository groupMemberRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @DisplayName("요청 시작과 완료를 같은 생성 ID로 연결하고 HTTP 지표는 완료 로그에 남긴다.")
    @Test
    void correlatesRequestLogsWithoutTrustingClientId() throws Exception {
        // Given
        try (CapturedApplicationLogs logs = new CapturedApplicationLogs()) {
            // When
            Response response = RestAssured.given()
                    .header("X-Request-Id", "untrusted-client-id-sentinel")
                    .queryParam("keyword", "private-search-sentinel")
                    .queryParam("size", 3)
                    .get("/groups");

            // Then
            ILoggingEvent event = completedRequest(logs, response);
            String requestId = response.header("X-Request-Id");
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(requestId).isNotBlank().isNotEqualTo("untrusted-client-id-sentinel");
            assertThat(fields(event))
                    .containsEntry("http.request.id", requestId)
                    .containsEntry("http.response.status_code", 200)
                    .containsEntry("jarihana.route", "/api/groups")
                    .containsEntry("jarihana.request.query.size", 3);
            assertThat(fields(event).get("event.duration")).isInstanceOf(Long.class);
            assertThat(requestEvents(logs, requestId)).hasSize(2);
            assertThat(logText(logs)).doesNotContain("private-search-sentinel", "untrusted-client-id-sentinel");
            JsonNode json = ecsJson(event);
            assertThat(json.at("/http/request/id").asString()).isEqualTo(requestId);
            assertThat(json.at("/http/response/status_code").isIntegralNumber()).isTrue();
            assertThat(json.at("/event/duration").isIntegralNumber()).isTrue();
            assertThat(json.at("/event/category").isArray()).isTrue();
            assertThat(json.at("/event/type").isArray()).isTrue();
            assertThat(json.at("/service/name").asString()).isEqualTo("jarihana");
            assertThat(json.at("/service/version").asString()).isEqualTo("test-image-sha");
            assertThat(json.at("/service/environment").asString()).isEqualTo("test");
        }
    }

    @DisplayName("Security에서 차단한 401도 시작과 완료 로그 및 오류 코드를 남긴다.")
    @Test
    void recordsUnauthorizedRequestBeforeController() throws Exception {
        // Given
        try (CapturedApplicationLogs logs = new CapturedApplicationLogs()) {
            // When
            Response response = RestAssured.get("/groups/1/recruitments/1/registrations");
            // Then
            ILoggingEvent event = completedRequest(logs, response);

            assertThat(response.statusCode()).isEqualTo(401);
            assertThat(fields(event))
                    .containsEntry("http.response.status_code", 401)
                    .containsEntry("jarihana.error_code", "UNAUTHENTICATED")
                    .containsEntry("jarihana.auth_failure", "MISSING_TOKEN");
            assertThat(requestEvents(logs, response.header("X-Request-Id"))).hasSize(2);
        }
    }

    @DisplayName("만료 토큰을 로그에 노출하지 않고 401의 사유를 구분한다.")
    @Test
    void distinguishesExpiredTokenWithoutRecordingIt() throws Exception {
        // Given
        Clock expiredClock = Clock.fixed(TestSupportConfig.FIXED_NOW.atZone(TestSupportConfig.ZONE).toInstant()
                .minus(jwtProperties.validity()).minusSeconds(1), TestSupportConfig.ZONE);
        String expiredToken = new AccessTokenProvider(jwtProperties, expiredClock).issue(12L).value();
        try (CapturedApplicationLogs logs = new CapturedApplicationLogs()) {
            // When
            Response response = RestAssured.given()
                    .cookie(authCookieProperties.accessTokenName(), expiredToken).get("/members/me");
            // Then
            ILoggingEvent event = completedRequest(logs, response);

            assertThat(response.statusCode()).isEqualTo(401);
            assertThat(fields(event)).containsEntry("jarihana.auth_failure", "TOKEN_EXPIRED");
            assertThat(logText(logs)).doesNotContain(expiredToken);
        }
    }

    @DisplayName("CSRF 거절 403은 요청 바디를 수집하지 않고 거절 사유만 남긴다.")
    @Test
    void recordsCsrfDenialWithoutRequestBody() throws Exception {
        // Given
        try (CapturedApplicationLogs logs = new CapturedApplicationLogs()) {
            // When
            Response response = RestAssured.given().contentType("application/json")
                    .body("{\"message\":\"private-registration-message-sentinel\"}")
                    .post("/recruitments/1/registrations");
            // Then
            ILoggingEvent event = completedRequest(logs, response);

            assertThat(response.statusCode()).isEqualTo(403);
            assertThat(fields(event))
                    .containsEntry("http.response.status_code", 403)
                    .containsEntry("jarihana.auth_failure", "CSRF_MISSING")
                    .containsEntry("jarihana.error_code", "ACCESS_DENIED");
            assertThat(logText(logs)).doesNotContain("private-registration-message-sentinel");
        }
    }

    @DisplayName("검증 실패는 필드 이름만 기록하고 유효하지 않은 입력값은 제외한다.")
    @Test
    void recordsValidationFieldNamesWithoutInvalidValues() throws Exception {
        // Given
        try (CapturedApplicationLogs logs = new CapturedApplicationLogs()) {
            // When
            Response response = RestAssured.given().queryParam("size", 0)
                    .queryParam("keyword", "invalid-request-search-sentinel").get("/groups");
            // Then
            ILoggingEvent event = completedRequest(logs, response);

            assertThat(response.statusCode()).isEqualTo(400);
            assertThat(fields(event))
                    .containsEntry("jarihana.error_code", "INVALID_PARAMETER")
                    .containsEntry("jarihana.invalid_fields", List.of("size"));
            assertThat(fields(event)).doesNotContainKey("jarihana.request.query.size");
            assertThat(logText(logs)).doesNotContain("invalid-request-search-sentinel");
        }
    }

    @DisplayName("다른 요청의 완료 로그와 섞여도 응답 ID에 해당하는 완료 로그를 선택한다.")
    @Test
    void selectsCompletionForRequestedResponse() throws Exception {
        // Given
        try (CapturedApplicationLogs logs = new CapturedApplicationLogs()) {
            Response previous = RestAssured.get("/groups");
            completedRequest(logs, previous);

            // When
            Response response = RestAssured.get("/members/me");
            ILoggingEvent event = completedRequest(logs, response);

            // Then
            assertThat(response.statusCode()).isEqualTo(401);
            assertThat(response.header("X-Request-Id")).isNotEqualTo(previous.header("X-Request-Id"));
            assertThat(fields(event))
                    .containsEntry("http.request.id", response.header("X-Request-Id"))
                    .containsEntry("http.response.status_code", 401);
        }
    }

    @DisplayName("검증된 모집 바디의 허용 필드를 HTTP 완료 로그에 수집한다.")
    @Test
    void recordsSelectedBodyAndCommittedBusinessResult() throws Exception {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, "logging-member", Course.BACKEND));
        Group group = groupRepository.save(Group.createClub("로깅테스트모임", "소개", "설명", null, null,
                TestSupportConfig.FIXED_NOW));
        groupMemberRepository.save(GroupMember.createLeader(group, member, TestSupportConfig.FIXED_NOW));
        String token = accessTokenProvider.issue(member.getId()).value();
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");
        try (CapturedApplicationLogs logs = new CapturedApplicationLogs()) {
            // When
            Response response = RestAssured.given().contentType("application/json")
                    .cookie(authCookieProperties.accessTokenName(), token)
                    .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                    .body("{\"joinMethod\":\"APPROVAL\",\"capacity\":10,\"startsAt\":\"2026-08-20T00:00:00\"}")
                    .post("/groups/{groupId}/recruitments", group.getId());
            // Then
            ILoggingEvent event = completedRequest(logs, response);

            assertThat(response.statusCode()).isEqualTo(201);
            assertThat(fields(event))
                    .containsEntry("user.id", member.getId().toString())
                    .containsEntry("jarihana.request.body.joinMethod", "APPROVAL")
                    .containsEntry("jarihana.request.body.capacity", 10)
                    .containsEntry("jarihana.route", "/api/groups/{groupId}/recruitments");
            assertThat(logs.events()).anySatisfy(business -> assertThat(fields(business))
                    .containsEntry("event.action", "recruitment.create.completed")
                    .containsEntry("event.outcome", "success")
                    .containsEntry("jarihana.event.category", "business")
                    .doesNotContainKey("event.category"));
            assertThat(logText(logs)).doesNotContain(token, csrf, "가온", "로깅테스트모임");
            JsonNode json = ecsJson(event);
            assertThat(json.at("/user/id").asString()).isEqualTo(member.getId().toString());
            assertThat(json.at("/jarihana/request/body/capacity").intValue()).isEqualTo(10);
            assertThat(json.at("/jarihana/request/body/joinMethod").asString()).isEqualTo("APPROVAL");
        }
    }

    @DisplayName("인증된 회원 ID가 다음 익명 요청 로그로 넘어가지 않는다.")
    @Test
    void isolatesAuthenticatedMemberAcrossRequests() throws Exception {
        // Given
        String token = accessTokenProvider.issue(123L).value();
        try (CapturedApplicationLogs logs = new CapturedApplicationLogs()) {
            // When
            Response first = RestAssured.given().cookie(authCookieProperties.accessTokenName(), token).get("/groups");
            // Then
            assertThat(fields(completedRequest(logs, first))).containsEntry("user.id", "123");
            Response second = RestAssured.get("/groups");
            assertThat(fields(completedRequest(logs, second))).doesNotContainKey("user.id");
        }
    }

    @DisplayName("500은 오류 종류와 안전한 스택을 남기고 예외 메시지의 비밀값은 제외한다.")
    @Test
    void recordsUnexpectedFailureWithoutExceptionMessage() throws Exception {
        // Given
        try (CapturedApplicationLogs logs = new CapturedApplicationLogs()) {
            // When
            Response response = RestAssured.get("/groups/logging-failure");
            // Then
            ILoggingEvent event = completedRequest(logs, response);

            assertThat(response.statusCode()).isEqualTo(500);
            assertThat(fields(event)).containsEntry("jarihana.error_code", "INTERNAL_ERROR")
                    .containsEntry("http.response.status_code", 500);
            assertThat(logText(logs)).doesNotContain("private-exception-message-sentinel");
            assertThat(logs.events()).anySatisfy(error -> assertThat(fields(error))
                    .containsKey("error.stack_trace").containsEntry("error.type", IllegalStateException.class.getName()));
        }
    }

    private ILoggingEvent completedRequest(CapturedApplicationLogs logs, Response response) throws Exception {
        String requestId = response.header("X-Request-Id");
        Predicate<ILoggingEvent> matches = event -> "http.request.completed".equals(fields(event).get("event.action"))
                && requestId.equals(fields(event).get("http.request.id"));
        // Subscribe before scanning captured events so an event arriving between the two is not missed.
        CompletableFuture<ILoggingEvent> complete = logs.subscribe(matches);
        logs.events().stream().filter(matches).findFirst().ifPresent(complete::complete);
        return complete.get(5, TimeUnit.SECONDS);
    }

    private JsonNode ecsJson(ILoggingEvent event) {
        LoggerContext context = new LoggerContext();
        context.putObject(Environment.class.getName(), new MockEnvironment()
                .withProperty("logging.structured.ecs.service.name", "jarihana")
                .withProperty("logging.structured.ecs.service.version", "test-image-sha")
                .withProperty("logging.structured.ecs.service.environment", "test"));
        StructuredLogEncoder encoder = new StructuredLogEncoder();
        encoder.setContext(context);
        encoder.setFormat("ecs");
        encoder.start();
        try {
            return objectMapper.readTree(new String(encoder.encode(event), StandardCharsets.UTF_8));
        } finally {
            encoder.stop();
            context.stop();
        }
    }

    private List<ILoggingEvent> requestEvents(CapturedApplicationLogs logs, String requestId) {
        return logs.events().stream().filter(event -> {
            Map<String, Object> values = fields(event);
            return requestId.equals(values.get("http.request.id"))
                    && List.of("http.request.started", "http.request.completed").contains(values.get("event.action"));
        }).toList();
    }

    private String logText(CapturedApplicationLogs logs) {
        return logs.events().stream().map(event -> event.getFormattedMessage() + fields(event)
                + (event.getThrowableProxy() == null ? "" : event.getThrowableProxy().getMessage()))
                .toList().toString();
    }

    @TestComponent
    @RestController
    static class FailureController {
        @GetMapping("/groups/logging-failure")
        public void fail() {
            throw new IllegalStateException("private-exception-message-sentinel");
        }
    }
}
