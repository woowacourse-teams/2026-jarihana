package com.project.jarihana.auth.config;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class JwtPropertiesTest {

    private static final String SECRET = "access-token-secret-key-for-hmac-sha256-0001";
    private static final Duration VALIDITY = Duration.ofHours(1);

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @DisplayName("온전한 설정은 위반이 없다.")
    @Test
    void acceptCompleteProperties() {
        // Given
        JwtProperties properties = new JwtProperties(SECRET, VALIDITY);

        // When
        Set<ConstraintViolation<JwtProperties>> violations = validator.validate(properties);

        // Then
        assertThat(violations).isEmpty();
    }

    /**
     * 짧은 키는 Keys.hmacShaKeyFor가 기동이 아니라 첫 발급 시점에 거부한다. 그전에 잡는다.
     */
    @DisplayName("32바이트보다 짧은 서명 키는 위반으로 잡는다.")
    @Test
    void rejectShortSecret() {
        // Given
        JwtProperties properties = new JwtProperties("too-short-secret", VALIDITY);

        // When
        Set<ConstraintViolation<JwtProperties>> violations = validator.validate(properties);

        // Then
        assertThat(violations)
                .extracting(violation -> violation.getPropertyPath().toString())
                .containsExactly("secret");
    }

    @DisplayName("유효 기간이 없으면 위반으로 잡는다.")
    @Test
    void rejectMissingValidity() {
        // Given
        JwtProperties properties = new JwtProperties(SECRET, null);

        // When
        Set<ConstraintViolation<JwtProperties>> violations = validator.validate(properties);

        // Then
        assertThat(violations)
                .extracting(violation -> violation.getPropertyPath().toString())
                .containsExactly("validity");
    }
}
