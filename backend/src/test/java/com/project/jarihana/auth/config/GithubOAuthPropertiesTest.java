package com.project.jarihana.auth.config;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class GithubOAuthPropertiesTest {

    private static final String CLIENT_ID = "test-client-id";
    private static final String CLIENT_SECRET = "test-client-secret";
    private static final String REDIRECT_URI = "http://localhost:8080/api/oauth/github/callback";
    private static final String TOKEN_URI = "https://github.com/login/oauth/access_token";
    private static final String USER_URI = "https://api.github.com/user";

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @DisplayName("온전한 설정은 위반이 없다.")
    @Test
    void acceptCompleteProperties() {
        // Given
        GithubOAuthProperties properties = propertiesWith(CLIENT_ID, CLIENT_SECRET, TOKEN_URI);

        // When
        Set<ConstraintViolation<GithubOAuthProperties>> violations = validator.validate(properties);

        // Then
        assertThat(violations).isEmpty();
    }

    /**
     * 환경변수 기본값이 빈 문자열이라, 검증이 없으면 환경변수를 넣지 않아도 기동에 성공한다.
     */
    @DisplayName("클라이언트 식별자가 비면 위반으로 잡는다.")
    @Test
    void rejectBlankClientId() {
        // Given
        GithubOAuthProperties properties = propertiesWith("", CLIENT_SECRET, TOKEN_URI);

        // When
        Set<ConstraintViolation<GithubOAuthProperties>> violations = validator.validate(properties);

        // Then
        assertThat(violations)
                .extracting(violation -> violation.getPropertyPath().toString())
                .containsExactly("clientId");
    }

    @DisplayName("클라이언트 비밀값이 비면 위반으로 잡는다.")
    @Test
    void rejectBlankClientSecret() {
        // Given
        GithubOAuthProperties properties = propertiesWith(CLIENT_ID, "", TOKEN_URI);

        // When
        Set<ConstraintViolation<GithubOAuthProperties>> violations = validator.validate(properties);

        // Then
        assertThat(violations)
                .extracting(violation -> violation.getPropertyPath().toString())
                .containsExactly("clientSecret");
    }

    /**
     * 그대로 HTTP 요청 대상이 되므로 scheme이 없으면 RestClient가 상대 경로로 읽는다.
     */
    @DisplayName("scheme 없는 URI는 위반으로 잡는다.")
    @Test
    void rejectUriWithoutScheme() {
        // Given
        GithubOAuthProperties properties =
                propertiesWith(CLIENT_ID, CLIENT_SECRET, "github.com/login/oauth/access_token");

        // When
        Set<ConstraintViolation<GithubOAuthProperties>> violations = validator.validate(properties);

        // Then
        assertThat(violations)
                .extracting(violation -> violation.getPropertyPath().toString())
                .containsExactly("tokenUri");
    }

    private GithubOAuthProperties propertiesWith(String clientId, String clientSecret, String tokenUri) {
        return new GithubOAuthProperties(clientId, clientSecret, REDIRECT_URI, tokenUri, USER_URI);
    }
}
