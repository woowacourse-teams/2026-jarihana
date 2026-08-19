package com.project.jarihana.auth.command.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.auth.command.service.dto.GithubAuthorizationResult;
import com.project.jarihana.auth.config.GithubOAuthProperties;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.util.UriComponentsBuilder;

class GithubAuthorizationStarterTest {

    private static final String CLIENT_ID = "client-id";
    private static final String REDIRECT_URI = "http://localhost:8080/api/oauth/github/callback";
    private static final String AUTHORIZATION_URI = "https://github.com/login/oauth/authorize";

    @DisplayName("설정값으로 GitHub 인가 URI를 만들고 state를 함께 돌려준다.")
    @Test
    void buildAuthorizationUri() {
        // Given
        GithubAuthorizationStarter starter = starterWith(CLIENT_ID, REDIRECT_URI, AUTHORIZATION_URI);

        // When
        GithubAuthorizationResult result = starter.start();

        // Then
        assertThat(result.authorizationUri()).startsWith(AUTHORIZATION_URI);
        assertThat(queryParam(result.authorizationUri(), "client_id")).isEqualTo(CLIENT_ID);
        assertThat(queryParam(result.authorizationUri(), "redirect_uri")).isEqualTo(REDIRECT_URI);
        assertThat(queryParam(result.authorizationUri(), "state")).isEqualTo(result.state());
        assertThat(result.state()).isNotBlank();
    }

    @DisplayName("호출마다 다른 state를 발급한다.")
    @Test
    void issueDifferentStatePerCall() {
        // Given
        GithubAuthorizationStarter starter = starterWith(CLIENT_ID, REDIRECT_URI, AUTHORIZATION_URI);

        // When
        String first = starter.start().state();
        String second = starter.start().state();

        // Then
        assertThat(first).isNotEqualTo(second);
    }

    @DisplayName("Client ID가 비어 있으면 설정 오류로 거부한다.")
    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", " "})
    void rejectBlankClientId(String clientId) {
        // Given
        GithubAuthorizationStarter starter = starterWith(clientId, REDIRECT_URI, AUTHORIZATION_URI);

        // When

        // Then
        assertThatThrownBy(starter::start)
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.OAUTH_CONFIGURATION_ERROR);
    }

    @DisplayName("Redirect URI가 비어 있으면 설정 오류로 거부한다.")
    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", " "})
    void rejectBlankRedirectUri(String redirectUri) {
        // Given
        GithubAuthorizationStarter starter = starterWith(CLIENT_ID, redirectUri, AUTHORIZATION_URI);

        // When

        // Then
        assertThatThrownBy(starter::start)
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.OAUTH_CONFIGURATION_ERROR);
    }

    @DisplayName("인가 URI가 비어 있으면 설정 오류로 거부한다.")
    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", " "})
    void rejectBlankAuthorizationUri(String authorizationUri) {
        // Given
        GithubAuthorizationStarter starter = starterWith(CLIENT_ID, REDIRECT_URI, authorizationUri);

        // When

        // Then
        assertThatThrownBy(starter::start)
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.OAUTH_CONFIGURATION_ERROR);
    }

    private GithubAuthorizationStarter starterWith(String clientId, String redirectUri, String authorizationUri) {
        return new GithubAuthorizationStarter(new GithubOAuthProperties(
                clientId,
                "client-secret",
                redirectUri,
                authorizationUri,
                "https://github.com/login/oauth/access_token",
                "https://api.github.com/user"
        ));
    }

    private String queryParam(String uri, String name) {
        return UriComponentsBuilder.fromUriString(uri).build().getQueryParams().getFirst(name);
    }
}
