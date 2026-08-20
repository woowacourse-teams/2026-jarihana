package com.project.jarihana.common.auth;

import com.project.jarihana.common.exception.BusinessException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Access Token 쿠키를 읽어 인증만 수행한다.
 *
 * <p>토큰이 없거나 유효하지 않으면 인증하지 않고 다음 필터로 넘긴다. 응답 형식은
 * {@link UnauthenticatedEntryPoint}가 결정한다. 리소스 단위 권한은 이 필터가 아니라
 * Service와 도메인이 판단한다.
 */
public class JwtCookieAuthenticationFilter extends OncePerRequestFilter {

    private final AccessTokenProvider accessTokenProvider;
    private final AuthCookieProperties authCookieProperties;

    public JwtCookieAuthenticationFilter(
            AccessTokenProvider accessTokenProvider,
            AuthCookieProperties authCookieProperties
    ) {
        this.accessTokenProvider = accessTokenProvider;
        this.authCookieProperties = authCookieProperties;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        readAccessToken(request).ifPresent(this::authenticate);
        filterChain.doFilter(request, response);
    }

    private Optional<String> readAccessToken(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return Optional.empty();
        }
        return Arrays.stream(cookies)
                .filter(cookie -> authCookieProperties.accessTokenName().equals(cookie.getName()))
                .map(Cookie::getValue)
                .filter(value -> value != null && !value.isBlank())
                .findFirst();
    }

    private void authenticate(String accessToken) {
        try {
            Long memberId = accessTokenProvider.parseMemberId(accessToken);
            SecurityContextHolder.getContext()
                    .setAuthentication(new UsernamePasswordAuthenticationToken(memberId, null, List.of()));
        } catch (BusinessException exception) {
            SecurityContextHolder.clearContext();
        }
    }
}
