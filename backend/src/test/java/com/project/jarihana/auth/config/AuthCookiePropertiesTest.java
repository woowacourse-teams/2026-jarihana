package com.project.jarihana.auth.config;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class AuthCookiePropertiesTest {

    private static final String ACCESS_TOKEN_NAME = "accessToken";
    private static final String ACCESS_TOKEN_PATH = "/";
    private static final String REFRESH_TOKEN_NAME = "refreshToken";
    private static final String REFRESH_TOKEN_PATH = "/api/auth";

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @DisplayName("온전한 설정은 위반이 없다.")
    @Test
    void acceptCompleteProperties() {
        // Given
        AuthCookieProperties properties = propertiesWith(true, ACCESS_TOKEN_PATH, REFRESH_TOKEN_PATH);

        // When
        Set<ConstraintViolation<AuthCookieProperties>> violations = validator.validate(properties);

        // Then
        assertThat(violations).isEmpty();
    }

    /**
     * 원시 타입이었다면 설정을 빠뜨려도 조용히 false로 묶여, Secure 없는 자격 증명 쿠키가
     * 나가는 것을 아무도 모른다. 이 테스트가 감싼 타입을 지킨다.
     */
    @DisplayName("Secure 속성을 빠뜨리면 위반으로 잡는다.")
    @Test
    void rejectMissingSecure() {
        // Given
        AuthCookieProperties properties = propertiesWith(null, ACCESS_TOKEN_PATH, REFRESH_TOKEN_PATH);

        // When
        Set<ConstraintViolation<AuthCookieProperties>> violations = validator.validate(properties);

        // Then
        assertThat(violations)
                .extracting(violation -> violation.getPropertyPath().toString())
                .containsExactly("secure");
    }

    @DisplayName("쿠키 이름이 비면 위반으로 잡는다.")
    @Test
    void rejectBlankCookieName() {
        // Given
        AuthCookieProperties properties = new AuthCookieProperties(
                true, " ", ACCESS_TOKEN_PATH, REFRESH_TOKEN_NAME, REFRESH_TOKEN_PATH);

        // When
        Set<ConstraintViolation<AuthCookieProperties>> violations = validator.validate(properties);

        // Then
        assertThat(violations)
                .extracting(violation -> violation.getPropertyPath().toString())
                .containsExactly("accessTokenName");
    }

    /**
     * RFC 6265는 슬래시로 시작하지 않는 Path를 무시하고 요청 URI에서 유도한 기본 경로를 쓴다.
     * 그러면 쿠키가 의도한 범위 밖으로 퍼진다.
     */
    @DisplayName("슬래시로 시작하지 않는 쿠키 경로는 위반으로 잡는다.")
    @Test
    void rejectPathWithoutLeadingSlash() {
        // Given
        AuthCookieProperties properties = propertiesWith(true, ACCESS_TOKEN_PATH, "api/auth");

        // When
        Set<ConstraintViolation<AuthCookieProperties>> violations = validator.validate(properties);

        // Then
        assertThat(violations)
                .extracting(violation -> violation.getPropertyPath().toString())
                .containsExactly("refreshTokenPath");
    }

    private AuthCookieProperties propertiesWith(Boolean secure, String accessTokenPath, String refreshTokenPath) {
        return new AuthCookieProperties(
                secure,
                ACCESS_TOKEN_NAME,
                accessTokenPath,
                REFRESH_TOKEN_NAME,
                refreshTokenPath
        );
    }
}
