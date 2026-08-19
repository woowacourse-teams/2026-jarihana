package com.project.jarihana.auth.command.service;

import com.project.jarihana.auth.command.service.dto.GithubAuthorizationResult;
import com.project.jarihana.auth.config.GithubOAuthProperties;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.security.SecureRandom;
import java.util.Base64;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * GitHub OAuth 인가를 시작한다.
 *
 * <p>여기서 만든 {@code state}를 표현 계층이 브라우저 세션에 보관하고, 콜백이 GitHub에게서
 * 되돌려받은 값과 대조한다. 콜백은 값을 받기만 하므로 생성 지점이 인가 시작 쪽에 있어야
 * 위조된 콜백 요청을 걸러낼 수 있다.
 */
@Service
public class GithubAuthorizationStarter {

    private static final int STATE_BYTE_LENGTH = 32;
    private static final String CONFIGURATION_ERROR_MESSAGE = "GitHub 로그인을 시작할 수 없습니다.";

    private final SecureRandom secureRandom = new SecureRandom();

    private final GithubOAuthProperties githubOAuthProperties;

    public GithubAuthorizationStarter(GithubOAuthProperties githubOAuthProperties) {
        this.githubOAuthProperties = githubOAuthProperties;
    }

    public GithubAuthorizationResult start() {
        validateConfiguration();
        String state = generateState();
        return new GithubAuthorizationResult(authorizationUri(state), state);
    }

    private void validateConfiguration() {
        if (isBlank(githubOAuthProperties.clientId())
                || isBlank(githubOAuthProperties.redirectUri())
                || isBlank(githubOAuthProperties.authorizationUri())) {
            throw new BusinessException(ErrorCode.OAUTH_CONFIGURATION_ERROR, CONFIGURATION_ERROR_MESSAGE);
        }
    }

    private String generateState() {
        byte[] stateBytes = new byte[STATE_BYTE_LENGTH];
        secureRandom.nextBytes(stateBytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(stateBytes);
    }

    private String authorizationUri(String state) {
        return UriComponentsBuilder.fromUriString(githubOAuthProperties.authorizationUri())
                .queryParam("client_id", githubOAuthProperties.clientId())
                .queryParam("redirect_uri", githubOAuthProperties.redirectUri())
                .queryParam("state", state)
                .encode()
                .build()
                .toUriString();
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
