package com.project.jarihana.auth.command.controller;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import com.project.jarihana.auth.command.service.RefreshTokenHasher;
import com.project.jarihana.auth.command.service.RefreshTokenIssuer;
import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.config.JwtProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.CapturedApplicationLogs;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.RefreshTokenTestRepository;
import com.project.jarihana.support.TestSupportConfig;
import io.restassured.RestAssured;
import io.restassured.http.Cookie;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

class AuthRefreshAcceptanceTest extends IntegrationTestSupport {

    private static final String REFRESH_PATH = "/auth/refresh";
    private static final String MY_PROFILE_PATH = "/members/me";
    private static final String CSRF_COOKIE_NAME = "XSRF-TOKEN";
    private static final String CSRF_HEADER_NAME = "X-XSRF-TOKEN";
    private static final String GITHUB_ID = "123456";
    private static final LocalDateTime NOW = TestSupportConfig.FIXED_NOW;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private RefreshTokenTestRepository refreshTokenTestRepository;

    @Autowired
    private RefreshTokenIssuer refreshTokenIssuer;

    @Autowired
    private RefreshTokenHasher refreshTokenHasher;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @Autowired
    private JwtProperties jwtProperties;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @DisplayName("Refresh Token으로 Access Token을 재발급한다.")
    @Test
    void reissueAccessToken() {
        // Given
        Member member = saveMember();
        String refreshToken = refreshTokenIssuer.issue(member).value();

        // When
        ExtractableResponse<Response> response = refreshWith(refreshToken);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(response.jsonPath().getBoolean("success")).isTrue();
        assertThat(response.jsonPath().getLong("data.expiresIn")).isEqualTo(jwtProperties.validity().toSeconds());
        Cookie accessCookie = response.detailedCookie(authCookieProperties.accessTokenName());
        assertThat(accessCookie.isHttpOnly()).isTrue();
        assertThat(accessTokenProvider.parseMemberId(accessCookie.getValue())).isEqualTo(member.getId());
    }

    @DisplayName("응답 본문에 Access Token 값을 담지 않는다.")
    @Test
    void notExposeAccessTokenInBody() {
        // Given
        Member member = saveMember();
        String refreshToken = refreshTokenIssuer.issue(member).value();

        // When
        ExtractableResponse<Response> response = refreshWith(refreshToken);

        // Then
        assertThat((Object) response.jsonPath().get("data.accessToken")).isNull();
        assertThat((Object) response.jsonPath().get("data.refreshToken")).isNull();
    }

    @DisplayName("재발급하면 새 Refresh Token을 쿠키로 내리고 사용한 토큰은 회전 처리한다.")
    @Test
    void rotateRefreshTokenOnRefresh() {
        // Given
        Member member = saveMember();
        String refreshToken = refreshTokenIssuer.issue(member).value();

        // When
        ExtractableResponse<Response> response = refreshWith(refreshToken);

        // Then
        Cookie rotatedCookie = response.detailedCookie(authCookieProperties.refreshTokenName());
        assertThat(rotatedCookie.getValue()).isNotBlank().isNotEqualTo(refreshToken);
        assertThat(rotatedCookie.isHttpOnly()).isTrue();
        assertThat(rotatedCookie.getPath()).isEqualTo(authCookieProperties.refreshTokenPath());
        assertThat(rotatedCookie.getMaxAge()).isEqualTo(Duration.ofDays(14).toSeconds());
        assertThat(rotatedAtOf(refreshToken)).isEqualTo(NOW);
        assertThat(rotatedAtOf(rotatedCookie.getValue())).isNull();
    }

    @DisplayName("회전한 Refresh Token도 다음 재발급에 쓸 수 있다.")
    @Test
    void reissueWithRotatedRefreshToken() {
        // Given
        Member member = saveMember();
        String first = refreshTokenIssuer.issue(member).value();
        String second = rotatedRefreshTokenOf(refreshWith(first));

        // When
        ExtractableResponse<Response> response = refreshWith(second);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(rotatedRefreshTokenOf(response)).isNotEqualTo(second);
    }

    @DisplayName("회전은 로그인 때 정한 절대 만료를 늘리지 않는다.")
    @Test
    void keepAbsoluteExpiryWhenRotating() {
        // Given
        Member member = saveMember();
        String refreshToken = refreshTokenIssuer.issue(member).value();
        LocalDateTime absoluteExpiry = NOW.plusDays(1);
        jdbcTemplate.update("update refresh_token_family set absolute_expires_at = ? where member_id = ?",
                absoluteExpiry, member.getId());
        jdbcTemplate.update("update refresh_token set expires_at = ? where token_hash = ?",
                absoluteExpiry, refreshTokenHasher.hash(refreshToken));

        // When
        ExtractableResponse<Response> response = refreshWith(refreshToken);

        // Then
        Cookie rotatedCookie = response.detailedCookie(authCookieProperties.refreshTokenName());
        assertThat(rotatedCookie.getMaxAge()).isEqualTo(Duration.ofDays(1).toSeconds());
        assertThat(expiresAtOf(rotatedCookie.getValue())).isEqualTo(absoluteExpiry);
    }

    @DisplayName("회전 직후 같은 Refresh Token이 다시 오면 Access Token만 발급하고 로그인을 유지한다.")
    @Test
    void reissueOnlyAccessTokenWithinReuseGrace() {
        // Given
        Member member = saveMember();
        String first = refreshTokenIssuer.issue(member).value();
        String second = rotatedRefreshTokenOf(refreshWith(first));

        // When
        ExtractableResponse<Response> replay = refreshWith(first);

        // Then
        assertThat(replay.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(replay.detailedCookie(authCookieProperties.accessTokenName()).getMaxAge()).isPositive();
        assertThat(replay.cookie(authCookieProperties.refreshTokenName())).isNull();
        assertThat(revokeReasonOf(member)).isNull();
        assertThat(refreshWith(second).statusCode()).isEqualTo(HttpStatus.OK.value());
    }

    @DisplayName("유예 시간이 지난 뒤 회전된 Refresh Token이 다시 오면 최신 토큰까지 같은 로그인을 폐기한다.")
    @Test
    void revokeFamilyWhenRotatedTokenReusedAfterGrace() {
        // Given
        Member member = saveMember();
        String first = refreshTokenIssuer.issue(member).value();
        String second = rotatedRefreshTokenOf(refreshWith(first));
        LocalDateTime longAgo = NOW.minusMinutes(5);
        jdbcTemplate.update("update refresh_token set rotated_at = ?, expires_at = ? where token_hash = ?",
                longAgo, longAgo, refreshTokenHasher.hash(first));

        // When
        ExtractableResponse<Response> reused = refreshWith(first);
        ExtractableResponse<Response> latest = refreshWith(second);

        // Then
        assertThat(reused.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(reused.jsonPath().getString("error.code")).isEqualTo("REFRESH_TOKEN_INVALID");
        assertThat(reused.detailedCookie(authCookieProperties.accessTokenName()).getMaxAge()).isZero();
        assertThat(reused.detailedCookie(authCookieProperties.refreshTokenName()).getMaxAge()).isZero();
        assertThat(latest.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(revokeReasonOf(member)).isEqualTo("REUSE_DETECTED");
        assertThat(refreshTokenTestRepository.findAll()).isEmpty();
    }

    @DisplayName("회전 후 정확히 유예 시간이 지난 재제출부터 재사용으로 본다.")
    @Test
    void detectReuseExactlyAtGraceBoundary() {
        // Given
        Member member = saveMember();
        String first = refreshTokenIssuer.issue(member).value();
        refreshWith(first);
        LocalDateTime graceEnd = NOW.minusSeconds(10);
        jdbcTemplate.update("update refresh_token set rotated_at = ?, expires_at = ? where token_hash = ?",
                graceEnd, NOW, refreshTokenHasher.hash(first));

        // When
        ExtractableResponse<Response> response = refreshWith(first);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(revokeReasonOf(member)).isEqualTo("REUSE_DETECTED");
    }

    @DisplayName("재사용을 감지하면 토큰 값 없이 경고 로그를 남긴다.")
    @Test
    void warnWithoutTokenValueWhenReuseDetected() {
        // Given
        Member member = saveMember();
        String first = refreshTokenIssuer.issue(member).value();
        String second = rotatedRefreshTokenOf(refreshWith(first));
        LocalDateTime longAgo = NOW.minusMinutes(5);
        jdbcTemplate.update("update refresh_token set rotated_at = ?, expires_at = ? where token_hash = ?",
                longAgo, longAgo, refreshTokenHasher.hash(first));

        try (CapturedApplicationLogs logs = new CapturedApplicationLogs()) {
            // When
            refreshWith(first);

            // Then
            List<ILoggingEvent> warnings = logs.events().stream()
                    .filter(event -> event.getLevel() == Level.WARN)
                    .filter(event -> event.getFormattedMessage().contains("재사용"))
                    .toList();
            assertThat(warnings).hasSize(1);
            String message = warnings.get(0).getFormattedMessage();
            assertThat(message).contains("memberId=" + member.getId())
                    .doesNotContain(first, second, refreshTokenHasher.hash(first));
        }
    }

    @DisplayName("같은 Refresh Token으로 동시에 재발급해도 새 Refresh Token은 하나만 발급하고 로그인을 유지한다.")
    @Test
    void rotateOnceForConcurrentRefreshes() throws Exception {
        // Given
        Member member = saveMember();
        String refreshToken = refreshTokenIssuer.issue(member).value();
        String csrfToken = issueCsrfToken();
        int requestCount = 4;
        ExecutorService executor = Executors.newFixedThreadPool(requestCount);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<ExtractableResponse<Response>>> futures = new ArrayList<>();

        try {
            for (int i = 0; i < requestCount; i++) {
                futures.add(executor.submit(() -> {
                    start.await();
                    return RestAssured.given()
                            .cookie(CSRF_COOKIE_NAME, csrfToken)
                            .header(CSRF_HEADER_NAME, csrfToken)
                            .cookie(authCookieProperties.refreshTokenName(), refreshToken)
                            .when()
                            .post(REFRESH_PATH)
                            .then()
                            .extract();
                }));
            }

            // When
            start.countDown();
            List<ExtractableResponse<Response>> responses = new ArrayList<>();
            for (Future<ExtractableResponse<Response>> future : futures) {
                responses.add(future.get(30, TimeUnit.SECONDS));
            }

            // Then
            assertThat(responses).allSatisfy(response ->
                    assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value()));
            assertThat(responses)
                    .filteredOn(response -> response.cookie(authCookieProperties.refreshTokenName()) != null)
                    .hasSize(1);
            assertThat(refreshTokenTestRepository.findAll()).hasSize(2);
            assertThat(revokeReasonOf(member)).isNull();
        } finally {
            executor.shutdownNow();
        }
    }

    @DisplayName("패밀리 없이 저장된 이전 Refresh Token도 원래 만료를 지키며 회전한다.")
    @Test
    void adoptRefreshTokenWithoutFamily() {
        // Given
        Member member = saveMember();
        String legacyToken = "legacy-refresh-token";
        LocalDateTime originalExpiry = NOW.plusDays(3);
        insertTokenWithoutFamily(member, legacyToken, originalExpiry);

        // When
        ExtractableResponse<Response> response = refreshWith(legacyToken);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
        String rotated = rotatedRefreshTokenOf(response);
        assertThat(expiresAtOf(rotated)).isEqualTo(originalExpiry);
        assertThat(jdbcTemplate.queryForObject(
                "select absolute_expires_at from refresh_token_family where member_id = ?",
                LocalDateTime.class, member.getId())).isEqualTo(originalExpiry);
        assertThat(rotatedAtOf(legacyToken)).isEqualTo(NOW);
    }

    @DisplayName("Refresh Token이 없으면 거부한다.")
    @Test
    void rejectRefreshWithoutToken() {
        // Given

        // When
        ExtractableResponse<Response> response = refresh(request -> request);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("REFRESH_TOKEN_REQUIRED");
    }

    @DisplayName("저장소에 없는 Refresh Token은 거부한다.")
    @Test
    void rejectUnknownRefreshToken() {
        // Given

        // When
        ExtractableResponse<Response> response = refreshWith("unknown-refresh-token");

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("REFRESH_TOKEN_INVALID");
    }

    @DisplayName("유효 기간이 지난 Refresh Token은 거부한다.")
    @Test
    void rejectExpiredRefreshToken() {
        // Given
        Member member = saveMember();
        String expiredToken = "expired-refresh-token";
        insertTokenWithoutFamily(member, expiredToken, NOW.minusSeconds(1));

        // When
        ExtractableResponse<Response> response = refreshWith(expiredToken);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("REFRESH_TOKEN_INVALID");
        assertThat(refreshTokenTestRepository.findAll()).hasSize(1);
    }

    @DisplayName("로그인 후 절대 만료가 지난 패밀리의 Refresh Token은 거부한다.")
    @Test
    void rejectRefreshTokenOfExpiredFamily() {
        // Given
        Member member = saveMember();
        String refreshToken = refreshTokenIssuer.issue(member).value();
        jdbcTemplate.update("update refresh_token_family set absolute_expires_at = ? where member_id = ?",
                NOW.minusSeconds(1), member.getId());

        // When
        ExtractableResponse<Response> response = refreshWith(refreshToken);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("REFRESH_TOKEN_INVALID");
    }

    @DisplayName("만료된 Refresh Token으로 실패하면 자격 증명 쿠키를 거둔다.")
    @Test
    void expireCredentialCookiesWhenRefreshTokenExpired() {
        // Given
        Member member = saveMember();
        String expiredToken = "expired-refresh-token";
        insertTokenWithoutFamily(member, expiredToken, NOW.minusSeconds(1));

        // When
        ExtractableResponse<Response> response = refreshWith(expiredToken);

        // Then
        assertThat(response.detailedCookie(authCookieProperties.accessTokenName()).getMaxAge()).isZero();
        assertThat(response.detailedCookie(authCookieProperties.refreshTokenName()).getMaxAge()).isZero();
    }

    @DisplayName("Refresh Token이 없어 실패해도 자격 증명 쿠키를 거둔다.")
    @Test
    void expireCredentialCookiesWhenRefreshTokenMissing() {
        // Given

        // When
        ExtractableResponse<Response> response = refresh(request -> request);

        // Then
        assertThat(response.detailedCookie(authCookieProperties.accessTokenName()).getMaxAge()).isZero();
        assertThat(response.detailedCookie(authCookieProperties.refreshTokenName()).getMaxAge()).isZero();
    }

    @DisplayName("내 정보 조회가 401을 줄 때는 자격 증명 쿠키를 거두지 않는다.")
    @Test
    void keepCredentialCookiesWhenOtherEndpointRejects() {
        // Given

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .cookie(authCookieProperties.accessTokenName(), "not-a-json-web-token")
                .when()
                .get(MY_PROFILE_PATH)
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.cookie(authCookieProperties.accessTokenName())).isNull();
        assertThat(response.cookie(authCookieProperties.refreshTokenName())).isNull();
    }

    @DisplayName("CSRF 토큰이 없는 재발급 요청은 거부한다.")
    @Test
    void rejectRefreshWithoutCsrfToken() {
        // Given
        Member member = saveMember();
        String refreshToken = refreshTokenIssuer.issue(member).value();

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .cookie(authCookieProperties.refreshTokenName(), refreshToken)
                .when()
                .post(REFRESH_PATH)
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("ACCESS_DENIED");
    }

    private Member saveMember() {
        return memberRepository.save(Member.create("가온", 8, GITHUB_ID, Course.BACKEND));
    }

    private ExtractableResponse<Response> refreshWith(String refreshToken) {
        return refresh(request -> request.cookie(authCookieProperties.refreshTokenName(), refreshToken));
    }

    private ExtractableResponse<Response> refresh(CredentialSpec credentials) {
        String csrfToken = issueCsrfToken();
        RequestSpecification request = RestAssured.given()
                .cookie(CSRF_COOKIE_NAME, csrfToken)
                .header(CSRF_HEADER_NAME, csrfToken);
        return credentials.apply(request)
                .when()
                .post(REFRESH_PATH)
                .then()
                .extract();
    }

    private String issueCsrfToken() {
        return RestAssured.given()
                .when()
                .get(MY_PROFILE_PATH)
                .then()
                .extract()
                .cookie(CSRF_COOKIE_NAME);
    }

    private String rotatedRefreshTokenOf(ExtractableResponse<Response> response) {
        String rotated = response.cookie(authCookieProperties.refreshTokenName());
        assertThat(rotated).isNotBlank();
        return rotated;
    }

    /**
     * 회전을 도입하기 전 버전은 패밀리 없이 행을 저장한다. 그 버전이 남긴 행을 그대로 흉내 낸다.
     */
    private void insertTokenWithoutFamily(Member member, String rawToken, LocalDateTime expiresAt) {
        jdbcTemplate.update("""
                        insert into refresh_token (created_at, updated_at, expires_at, token_hash, member_id)
                        values (?, ?, ?, ?, ?)
                        """,
                NOW.minusDays(1), NOW.minusDays(1), expiresAt, refreshTokenHasher.hash(rawToken), member.getId());
    }

    private LocalDateTime rotatedAtOf(String rawToken) {
        return jdbcTemplate.queryForObject("select rotated_at from refresh_token where token_hash = ?",
                LocalDateTime.class, refreshTokenHasher.hash(rawToken));
    }

    private LocalDateTime expiresAtOf(String rawToken) {
        return jdbcTemplate.queryForObject("select expires_at from refresh_token where token_hash = ?",
                LocalDateTime.class, refreshTokenHasher.hash(rawToken));
    }

    private String revokeReasonOf(Member member) {
        return jdbcTemplate.queryForObject(
                "select revoke_reason from refresh_token_family where member_id = ? order by id desc limit 1",
                String.class, member.getId());
    }

    @FunctionalInterface
    private interface CredentialSpec {

        RequestSpecification apply(RequestSpecification request);
    }
}
