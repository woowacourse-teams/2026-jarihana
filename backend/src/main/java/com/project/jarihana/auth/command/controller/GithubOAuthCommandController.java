package com.project.jarihana.auth.command.controller;

import com.project.jarihana.auth.command.service.GithubOAuthCommandService;
import com.project.jarihana.auth.command.service.dto.GithubLoginCommand;
import com.project.jarihana.auth.command.service.dto.GithubLoginResult;
import com.project.jarihana.auth.command.service.dto.IssuedRefreshToken;
import com.project.jarihana.auth.config.AuthProperties;
import com.project.jarihana.common.auth.IssuedAccessToken;
import com.project.jarihana.common.auth.JwtProperties;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.net.URI;
import java.util.Arrays;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriComponentsBuilder;

@RestController
@RequestMapping("/api/oauth/github")
public class GithubOAuthCommandController {

    private static final String FRONTEND_CALLBACK_PATH = "/oauth/callback";
    private static final String SIGNUP_REQUIRED_PARAMETER = "signupRequired";
    private static final String SAME_SITE_LAX = "Lax";
    private static final String STATE_COOKIE_PATH = "/";

    private final GithubOAuthCommandService githubOAuthCommandService;
    private final AuthProperties authProperties;
    private final JwtProperties jwtProperties;

    public GithubOAuthCommandController(
            GithubOAuthCommandService githubOAuthCommandService,
            AuthProperties authProperties,
            JwtProperties jwtProperties
    ) {
        this.githubOAuthCommandService = githubOAuthCommandService;
        this.authProperties = authProperties;
        this.jwtProperties = jwtProperties;
    }

    @GetMapping("/callback")
    public ResponseEntity<Void> handleGithubCallback(
            @RequestParam(name = "code", required = false) String code,
            @RequestParam(name = "state", required = false) String state,
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        GithubLoginCommand command =
                new GithubLoginCommand(code, state, consumeIssuedState(request, response));
        GithubLoginResult result = githubOAuthCommandService.login(command);
        if (result.signupRequired()) {
            storeSignupGithubId(request, result.githubId());
            return redirectToFrontend(true).build();
        }
        return redirectToFrontend(false)
                .header(HttpHeaders.SET_COOKIE, accessTokenCookie(result.accessToken()).toString())
                .header(HttpHeaders.SET_COOKIE, refreshTokenCookie(result.refreshToken()).toString())
                .build();
    }

    /**
     * 프론트엔드가 심은 state 쿠키를 읽고 즉시 만료시킨다.
     *
     * <p>프론트엔드는 같은 값을 이 쿠키와 authorize URL의 {@code state} 쿼리 양쪽에 싣는다.
     * 대조는 Service가 수행한다. 검증 성공 여부와 무관하게 만료시켜 한 번만 쓰이게 한다.
     */
    private String consumeIssuedState(HttpServletRequest request, HttpServletResponse response) {
        String issuedState = readStateCookie(request).orElse(null);
        response.addHeader(HttpHeaders.SET_COOKIE, expiredStateCookie().toString());
        return issuedState;
    }

    private Optional<String> readStateCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return Optional.empty();
        }
        return Arrays.stream(cookies)
                .filter(cookie -> authProperties.oauthStateCookieName().equals(cookie.getName()))
                .map(Cookie::getValue)
                .filter(value -> value != null && !value.isBlank())
                .findFirst();
    }

    private ResponseCookie expiredStateCookie() {
        return ResponseCookie.from(authProperties.oauthStateCookieName(), "")
                .path(STATE_COOKIE_PATH)
                .maxAge(0)
                .build();
    }

    private void storeSignupGithubId(HttpServletRequest request, String githubId) {
        request.getSession(true).setAttribute(OAuthSessionAttributes.SIGNUP_GITHUB_ID, githubId);
    }

    private ResponseEntity.BodyBuilder redirectToFrontend(boolean signupRequired) {
        URI location = UriComponentsBuilder.fromUriString(authProperties.frontendOrigin())
                .path(FRONTEND_CALLBACK_PATH)
                .queryParam(SIGNUP_REQUIRED_PARAMETER, signupRequired)
                .build()
                .toUri();
        return ResponseEntity.status(HttpStatus.FOUND).location(location);
    }

    private ResponseCookie accessTokenCookie(IssuedAccessToken accessToken) {
        return ResponseCookie.from(jwtProperties.cookieName(), accessToken.value())
                .httpOnly(true)
                .secure(authProperties.cookieSecure())
                .sameSite(SAME_SITE_LAX)
                .path(jwtProperties.cookiePath())
                .maxAge(accessToken.validity())
                .build();
    }

    private ResponseCookie refreshTokenCookie(IssuedRefreshToken refreshToken) {
        return ResponseCookie.from(authProperties.refreshCookieName(), refreshToken.value())
                .httpOnly(true)
                .secure(authProperties.cookieSecure())
                .sameSite(SAME_SITE_LAX)
                .path(authProperties.refreshCookiePath())
                .maxAge(refreshToken.validity())
                .build();
    }
}
