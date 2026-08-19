package com.project.jarihana.member.command.controller;

import com.project.jarihana.member.command.service.GithubOAuthCommandService;
import com.project.jarihana.member.command.service.dto.GithubLoginCommand;
import com.project.jarihana.member.command.service.dto.GithubLoginResult;
import com.project.jarihana.member.command.service.dto.IssuedRefreshToken;
import com.project.jarihana.member.config.AuthProperties;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.net.URI;
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

    private final GithubOAuthCommandService githubOAuthCommandService;
    private final AuthProperties authProperties;

    public GithubOAuthCommandController(
            GithubOAuthCommandService githubOAuthCommandService,
            AuthProperties authProperties
    ) {
        this.githubOAuthCommandService = githubOAuthCommandService;
        this.authProperties = authProperties;
    }

    @GetMapping("/callback")
    public ResponseEntity<Void> handleGithubCallback(
            @RequestParam(name = "code", required = false) String code,
            @RequestParam(name = "state", required = false) String state,
            HttpServletRequest request
    ) {
        GithubLoginCommand command = new GithubLoginCommand(code, state, consumeIssuedState(request));
        GithubLoginResult result = githubOAuthCommandService.login(command);
        if (result.signupRequired()) {
            storeSignupGithubId(request, result.githubId());
            return redirectToFrontend(true).build();
        }
        return redirectToFrontend(false)
                .header(HttpHeaders.SET_COOKIE, refreshTokenCookie(result.refreshToken()).toString())
                .build();
    }

    private String consumeIssuedState(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return null;
        }
        Object issuedState = session.getAttribute(OAuthSessionAttributes.OAUTH_STATE);
        session.removeAttribute(OAuthSessionAttributes.OAUTH_STATE);
        if (issuedState == null) {
            return null;
        }
        return String.valueOf(issuedState);
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
