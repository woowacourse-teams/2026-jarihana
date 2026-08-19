package com.project.jarihana.common.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class AccessTokenProviderTest {

    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 19, 10, 0);
    private static final Duration VALIDITY = Duration.ofHours(1);
    private static final String SECRET = "access-token-secret-key-for-hmac-sha256-0001";
    private static final String OTHER_SECRET = "access-token-secret-key-for-hmac-sha256-0002";
    private static final String COOKIE_NAME = "accessToken";
    private static final String COOKIE_PATH = "/";
    private static final Long MEMBER_ID = 12L;

    private final AccessTokenProvider accessTokenProvider = providerOf(SECRET, NOW);

    @DisplayName("발급한 Access Token에서 회원 식별자를 읽는다.")
    @Test
    void readMemberIdFromIssuedToken() {
        // Given
        IssuedAccessToken issued = accessTokenProvider.issue(MEMBER_ID);

        // When
        Long memberId = accessTokenProvider.parseMemberId(issued.value());

        // Then
        assertThat(issued.value()).isNotBlank();
        assertThat(memberId).isEqualTo(MEMBER_ID);
    }

    @DisplayName("발급한 Access Token의 유효 기간은 설정값을 따른다.")
    @Test
    void issueAccessTokenWithConfiguredValidity() {
        // Given

        // When
        IssuedAccessToken issued = accessTokenProvider.issue(MEMBER_ID);

        // Then
        assertThat(issued.validity()).isEqualTo(VALIDITY);
    }

    @DisplayName("유효 기간이 지난 Access Token은 거부한다.")
    @Test
    void rejectExpiredAccessToken() {
        // Given
        String expired = accessTokenProvider.issue(MEMBER_ID).value();
        AccessTokenProvider afterExpiry = providerOf(SECRET, NOW.plus(VALIDITY).plusSeconds(1));

        // When

        // Then
        assertThatThrownBy(() -> afterExpiry.parseMemberId(expired))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.UNAUTHENTICATED);
    }

    @DisplayName("유효 기간이 남아 있는 Access Token은 그대로 사용할 수 있다.")
    @Test
    void acceptAccessTokenBeforeExpiry() {
        // Given
        String issued = accessTokenProvider.issue(MEMBER_ID).value();
        AccessTokenProvider beforeExpiry = providerOf(SECRET, NOW.plus(VALIDITY).minusSeconds(1));

        // When
        Long memberId = beforeExpiry.parseMemberId(issued);

        // Then
        assertThat(memberId).isEqualTo(MEMBER_ID);
    }

    @DisplayName("다른 비밀키로 서명한 Access Token은 거부한다.")
    @Test
    void rejectAccessTokenSignedWithOtherSecret() {
        // Given
        String forged = providerOf(OTHER_SECRET, NOW).issue(MEMBER_ID).value();

        // When

        // Then
        assertThatThrownBy(() -> accessTokenProvider.parseMemberId(forged))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.UNAUTHENTICATED);
    }

    @DisplayName("JWT 형식이 아닌 값은 거부한다.")
    @Test
    void rejectMalformedAccessToken() {
        // Given
        String malformed = "not-a-json-web-token";

        // When

        // Then
        assertThatThrownBy(() -> accessTokenProvider.parseMemberId(malformed))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.UNAUTHENTICATED);
    }

    @DisplayName("같은 회원에게 발급한 Access Token도 발급 시각이 다르면 값이 다르다.")
    @Test
    void issueDifferentAccessTokenPerIssuedAt() {
        // Given
        AccessTokenProvider later = providerOf(SECRET, NOW.plusSeconds(1));

        // When
        String first = accessTokenProvider.issue(MEMBER_ID).value();
        String second = later.issue(MEMBER_ID).value();

        // Then
        assertThat(first).isNotEqualTo(second);
    }

    private AccessTokenProvider providerOf(String secret, LocalDateTime now) {
        JwtProperties properties = new JwtProperties(secret, VALIDITY, COOKIE_NAME, COOKIE_PATH);
        return new AccessTokenProvider(properties, Clock.fixed(now.atZone(ZONE).toInstant(), ZONE));
    }
}
