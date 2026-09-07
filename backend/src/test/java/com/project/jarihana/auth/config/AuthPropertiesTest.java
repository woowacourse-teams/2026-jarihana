package com.project.jarihana.auth.config;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class AuthPropertiesTest {

    private static final String ORIGIN = "http://localhost:5173";
    private static final String STATE_COOKIE_NAME = "oauthState";
    private static final Duration VALIDITY = Duration.ofDays(14);

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @DisplayName("온전한 설정은 위반이 없다.")
    @Test
    void acceptCompleteProperties() {
        // Given
        AuthProperties properties = new AuthProperties(ORIGIN, STATE_COOKIE_NAME, VALIDITY);

        // When
        Set<ConstraintViolation<AuthProperties>> violations = validator.validate(properties);

        // Then
        assertThat(violations).isEmpty();
    }

    @DisplayName("Refresh Token 유효 기간이 없으면 위반으로 잡는다.")
    @Test
    void rejectMissingRefreshTokenValidity() {
        // Given
        AuthProperties properties = new AuthProperties(ORIGIN, STATE_COOKIE_NAME, null);

        // When
        Set<ConstraintViolation<AuthProperties>> violations = validator.validate(properties);

        // Then
        assertThat(violations)
                .extracting(violation -> violation.getPropertyPath().toString())
                .containsExactly("refreshTokenValidity");
    }

    @DisplayName("state 쿠키 이름이 비면 위반으로 잡는다.")
    @Test
    void rejectBlankStateCookieName() {
        // Given
        AuthProperties properties = new AuthProperties(ORIGIN, " ", VALIDITY);

        // When
        Set<ConstraintViolation<AuthProperties>> violations = validator.validate(properties);

        // Then
        assertThat(violations)
                .extracting(violation -> violation.getPropertyPath().toString())
                .containsExactly("oauthStateCookieName");
    }

    /**
     * scheme이 없으면 UriComponentsBuilder가 "localhost"를 scheme으로 읽어 콜백 주소가 어긋난다.
     */
    @DisplayName("scheme 없는 프론트엔드 origin은 위반으로 잡는다.")
    @Test
    void rejectOriginWithoutScheme() {
        // Given
        AuthProperties properties = new AuthProperties("localhost:5173", STATE_COOKIE_NAME, VALIDITY);

        // When
        Set<ConstraintViolation<AuthProperties>> violations = validator.validate(properties);

        // Then
        assertThat(violations)
                .extracting(violation -> violation.getPropertyPath().toString())
                .containsExactly("frontendOrigin");
    }

    /**
     * 뒤에 콜백 경로를 덧붙이므로 끝에 슬래시가 있으면 경로에 슬래시가 겹친다.
     */
    @DisplayName("끝에 슬래시가 붙은 프론트엔드 origin은 위반으로 잡는다.")
    @Test
    void rejectOriginWithTrailingSlash() {
        // Given
        AuthProperties properties = new AuthProperties(ORIGIN + "/", STATE_COOKIE_NAME, VALIDITY);

        // When
        Set<ConstraintViolation<AuthProperties>> violations = validator.validate(properties);

        // Then
        assertThat(violations)
                .extracting(violation -> violation.getPropertyPath().toString())
                .containsExactly("frontendOrigin");
    }
}
