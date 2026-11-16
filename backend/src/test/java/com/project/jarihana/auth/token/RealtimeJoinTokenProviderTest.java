package com.project.jarihana.auth.token;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.auth.config.JwtProperties;
import com.project.jarihana.auth.config.RealtimeProperties;
import com.project.jarihana.common.exception.BusinessException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class RealtimeJoinTokenProviderTest {
    private static final String ACCESS_TOKEN_SECRET = "test-access-token-secret-key-for-hmac-sha256-0001";
    private static final String DEV_KEY = "_80NtQkcKD9mw_CffGhAjISOdxrCz12QRrG9H_n7TJs";
    private static final String PROD_KEY = "bNsm9fU3oju3q21ta6_fvazU-45b_fBfrF-j-38mByA";

    @ParameterizedTest
    @CsvSource({"local,jarihana-api-dev", "dev,jarihana-api-dev", "prod,jarihana-api-prod"})
    @DisplayName("활성화 설정 없이 실행 프로필에 해당하는 발급자로 입장 토큰을 서명한다")
    void issuesTokenWithIssuerForActiveProfile(String profile, String issuer) {
        // Given
        String key = profile.equals("prod") ? PROD_KEY : DEV_KEY;
        var verificationKey = Keys.hmacShaKeyFor(Base64.getUrlDecoder().decode(key));
        var contextRunner = new ApplicationContextRunner()
                .withInitializer(context -> context.getEnvironment().setActiveProfiles(profile))
                .withInitializer(new ConfigDataApplicationContextInitializer())
                .withUserConfiguration(RealtimeConfiguration.class, RealtimeJoinTokenProvider.class)
                .withBean(Clock.class, Clock::systemUTC)
                .withPropertyValues("REALTIME_WEBSOCKET_URL=", "jarihana.auth.jwt.secret=" + ACCESS_TOKEN_SECRET,
                        "jarihana.auth.jwt.validity=1h");

        contextRunner.run(context -> {
            // When
            var token = context.getBean(RealtimeJoinTokenProvider.class).issue(10, 20);
            var signed = Jwts.parser().verifyWith(verificationKey).build().parseSignedClaims(token.token());

            // Then
            assertThat(signed.getHeader().getAlgorithm()).isEqualTo("HS256");
            assertThat(signed.getPayload().getIssuer()).isEqualTo(issuer);
            assertThat(signed.getPayload().getAudience()).containsExactly("jarihana-realtime");
            assertThat(token.websocketUrl()).isEqualTo("ws://localhost:8090/ws/realtime");
            var accessTokens = new AccessTokenProvider(new JwtProperties(ACCESS_TOKEN_SECRET, Duration.ofHours(1)), Clock.systemUTC());
            assertThatThrownBy(() -> accessTokens.parseMemberId(token.token())).isInstanceOf(BusinessException.class);
        });
    }

    @EnableConfigurationProperties({RealtimeProperties.class, JwtProperties.class})
    static class RealtimeConfiguration {
    }
}
