package com.project.jarihana.common.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;

/**
 * 로컬 개발 서버에서 명시적으로 선택한 브라우저만 고정 개발 회원으로 인증한다.
 *
 * <p>{@link SecurityConfig}가 local 프로필과 전용 설정을 모두 확인한 뒤에만 이 필터를 설치한다.
 * 운영 환경에는 필터 자체가 등록되지 않으며, CSRF와 서비스 권한 검사는 기존 경로를 그대로 거친다.
 */
final class LocalDevelopmentAuthenticationFilter extends OncePerRequestFilter {

    static final String HEADER_NAME = "X-Jarihana-Development-Auth";
    private static final String ENABLED_HEADER_VALUE = "enabled";

    private final long memberId;

    LocalDevelopmentAuthenticationFilter(long memberId) {
        if (memberId < 1) {
            throw new IllegalArgumentException("Local development member id must be positive");
        }
        this.memberId = memberId;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        if (canAuthenticate(request)) {
            SecurityContextHolder.getContext().setAuthentication(
                    new UsernamePasswordAuthenticationToken(memberId, null, List.of())
            );
        }
        filterChain.doFilter(request, response);
    }

    private boolean canAuthenticate(HttpServletRequest request) {
        return SecurityContextHolder.getContext().getAuthentication() == null
                && ENABLED_HEADER_VALUE.equals(request.getHeader(HEADER_NAME))
                && isLoopback(request.getRemoteAddr());
    }

    private boolean isLoopback(String remoteAddress) {
        try {
            return InetAddress.getByName(remoteAddress).isLoopbackAddress();
        } catch (UnknownHostException exception) {
            return false;
        }
    }
}
