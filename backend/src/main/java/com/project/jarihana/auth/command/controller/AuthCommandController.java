package com.project.jarihana.auth.command.controller;

import com.project.jarihana.auth.command.controller.dto.RefreshResponse;
import com.project.jarihana.auth.command.controller.dto.LogoutRequest;
import jakarta.validation.Validator;
import tools.jackson.databind.json.JsonMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.RequestBody;
import com.project.jarihana.auth.command.service.AuthCommandService;
import com.project.jarihana.auth.command.service.dto.LogoutCommand;
import com.project.jarihana.auth.command.service.dto.RefreshCommand;
import com.project.jarihana.auth.command.service.dto.RefreshResult;
import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.cookie.AuthCookieFactory;
import com.project.jarihana.auth.cookie.AuthCookieReader;
import com.project.jarihana.auth.session.SignupSession;
import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.response.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import com.project.jarihana.common.exception.ErrorCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthCommandController {

    private final AuthCommandService authCommandService;
    private final AuthCookieProperties authCookieProperties;
    private final AuthCookieFactory authCookieFactory;
    private final LoginMemberReader loginMemberReader;
    private final SignupSession signupSession;
    private final JsonMapper jsonMapper;
    private final Validator validator;

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<RefreshResponse>> refresh(
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        RefreshCommand command = new RefreshCommand(readRefreshToken(request).orElse(null));
        RefreshResult result = refreshOrExpireCredentials(command, response);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, authCookieFactory.accessToken(result.accessToken()).toString())
                .body(ApiResponse.success(RefreshResponse.from(result)));
    }

    /**
     * 되돌아갈 경로가 없는데 브라우저가 쓸모없는 쿠키를 들고 있으면 프론트엔드가 로그인 화면으로
     * 보낼 근거가 없다. 이 규칙은 재발급 실패에만 적용한다. 다른 경로의 401까지 쿠키를 거두면
     * Access Token 만료로 401을 받은 순간 Refresh Token까지 사라져 재발급 경로 자체가 끊긴다.
     */
    private RefreshResult refreshOrExpireCredentials(RefreshCommand command, HttpServletResponse response) {
        try {
            return authCommandService.refresh(command);
        } catch (BusinessException exception) {
            response.addHeader(HttpHeaders.SET_COOKIE, authCookieFactory.expiredAccessToken().toString());
            response.addHeader(HttpHeaders.SET_COOKIE, authCookieFactory.expiredRefreshToken().toString());
            throw exception;
        }
    }

    private Optional<String> readRefreshToken(HttpServletRequest request) {
        return AuthCookieReader.read(request, authCookieProperties.refreshTokenName());
    }

    /**
     * 자격 증명이 Access Token, Refresh Token, 가입 세션 세 갈래여서 LoginMember 어노테이션을
     * 쓰지 않는다.
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request, @RequestBody(required = false) byte[] body) {
        return performLogout(request, readLogoutBody(request, body));
    }

    private LogoutRequest readLogoutBody(HttpServletRequest request, byte[] body) {
        if (body == null || body.length == 0) return null;
        try {
            if (body.length > 1024 || request.getContentType() == null
                    || !MediaType.APPLICATION_JSON.isCompatibleWith(MediaType.parseMediaType(request.getContentType()))) {
                throw new IllegalArgumentException();
            }
            LogoutRequest parsed = jsonMapper.readValue(body, LogoutRequest.class);
            if (parsed == null || !validator.validate(parsed).isEmpty()) throw new IllegalArgumentException();
            return parsed;
        } catch (RuntimeException exception) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "로그아웃 본문에 유효한 구독 ID와 연결 버전이 필요합니다.");
        }
    }

    private ResponseEntity<Void> performLogout(HttpServletRequest request, LogoutRequest body) {
        LogoutCommand command = new LogoutCommand(
                loginMemberReader.currentMemberId().orElse(null),
                signupSession.githubId(request).orElse(null),
                readRefreshToken(request).orElse(null)
        );
        authCommandService.logout(command, body == null ? null : body.toCommand());
        signupSession.invalidate(request);

        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, authCookieFactory.expiredAccessToken().toString())
                .header(HttpHeaders.SET_COOKIE, authCookieFactory.expiredRefreshToken().toString())
                .build();
    }
}
