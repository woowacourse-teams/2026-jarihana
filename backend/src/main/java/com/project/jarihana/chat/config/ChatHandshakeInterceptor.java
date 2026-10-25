package com.project.jarihana.chat.config;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.cookie.AuthCookieReader;
import com.project.jarihana.auth.token.AccessTokenProvider;

import lombok.RequiredArgsConstructor;

import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

@Component
@RequiredArgsConstructor
public class ChatHandshakeInterceptor implements HandshakeInterceptor {
    public static final String EXPIRY = "chat.tokenExpiry";
    private final AccessTokenProvider tokens;
    private final AuthCookieProperties cookies;

    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler handler,
            Map<String, Object> attributes) {
        if (!(request instanceof ServletServerHttpRequest servlet)
                || request.getPrincipal() == null) {
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }
        var http = servlet.getServletRequest();
        String token = AuthCookieReader.read(http, cookies.accessTokenName()).orElse(null);
        if (token == null) {
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }
        attributes.put(EXPIRY, tokens.parseExpiresAt(token));
        CsrfToken csrf = (CsrfToken) http.getAttribute(CsrfToken.class.getName());
        if (csrf == null) {
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        }
        attributes.put(CsrfToken.class.getName(), csrf);
        return true;
    }

    @Override
    public void afterHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler handler,
            Exception exception) {}
}
