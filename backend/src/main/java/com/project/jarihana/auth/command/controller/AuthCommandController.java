package com.project.jarihana.auth.command.controller;

import com.project.jarihana.auth.command.service.AuthCommandService;
import com.project.jarihana.auth.command.controller.dto.RefreshResponse;
import com.project.jarihana.auth.command.service.dto.LogoutCommand;
import com.project.jarihana.auth.command.service.dto.RefreshCommand;
import com.project.jarihana.auth.command.service.dto.RefreshResult;
import com.project.jarihana.common.auth.AuthCookieFactory;
import com.project.jarihana.common.auth.AuthCookieProperties;
import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.common.auth.SignupSession;
import com.project.jarihana.common.response.ApiResponse;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthCommandController {

    private final AuthCommandService authCommandService;
    private final AuthCookieProperties authCookieProperties;
    private final AuthCookieFactory authCookieFactory;
    private final LoginMemberReader loginMemberReader;
    private final SignupSession signupSession;

    public AuthCommandController(
            AuthCommandService authCommandService,
            AuthCookieProperties authCookieProperties,
            AuthCookieFactory authCookieFactory,
            LoginMemberReader loginMemberReader,
            SignupSession signupSession
    ) {
        this.authCommandService = authCommandService;
        this.authCookieProperties = authCookieProperties;
        this.authCookieFactory = authCookieFactory;
        this.loginMemberReader = loginMemberReader;
        this.signupSession = signupSession;
    }

    /**
     * Access Token은 응답 본문이 아니라 쿠키로 내린다(ADR 0002). Refresh Token은 회전하지 않으므로
     * 다시 내리지 않는다.
     */
    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<RefreshResponse>> refresh(HttpServletRequest request) {
        RefreshCommand command = new RefreshCommand(readRefreshToken(request).orElse(null));
        RefreshResult result = authCommandService.refresh(command);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, accessTokenCookie(result))
                .body(ApiResponse.success(RefreshResponse.from(result)));
    }

    private String accessTokenCookie(RefreshResult result) {
        return authCookieFactory
                .accessToken(result.accessToken().value(), result.accessToken().validity())
                .toString();
    }

    /**
     * 자격 증명이 Access Token, Refresh Token, 가입 세션 세 갈래여서 LoginMember 어노테이션을
     * 쓰지 않는다. 어느 쪽도 없을 때 거부하는 판단은 Service가 한다.
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        LogoutCommand command = new LogoutCommand(
                loginMemberReader.currentMemberId().orElse(null),
                signupSession.githubId(request).orElse(null),
                readRefreshToken(request).orElse(null)
        );
        authCommandService.logout(command);
        signupSession.invalidate(request);

        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, authCookieFactory.expiredAccessToken().toString())
                .header(HttpHeaders.SET_COOKIE, authCookieFactory.expiredRefreshToken().toString())
                .build();
    }

    private Optional<String> readRefreshToken(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return Optional.empty();
        }
        return Arrays.stream(cookies)
                .filter(cookie -> authCookieProperties.refreshTokenName().equals(cookie.getName()))
                .map(Cookie::getValue)
                .filter(value -> value != null && !value.isBlank())
                .findFirst();
    }
}
