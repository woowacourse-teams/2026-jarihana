package com.project.jarihana.auth.token;

import com.project.jarihana.auth.config.JwtProperties;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Date;

@Component
public class AccessTokenProvider {

    private static final String INVALID_TOKEN_MESSAGE = "인증 정보가 올바르지 않습니다.";

    private final SecretKey signingKey;
    private final JwtProperties jwtProperties;
    private final Clock clock;

    public AccessTokenProvider(JwtProperties jwtProperties, Clock clock) {
        this.signingKey = Keys.hmacShaKeyFor(jwtProperties.secret().getBytes(StandardCharsets.UTF_8));
        this.jwtProperties = jwtProperties;
        this.clock = clock;
    }

    public IssuedAccessToken issue(Long memberId) {
        Instant issuedAt = clock.instant();
        String value = Jwts.builder()
                .subject(String.valueOf(memberId))
                .issuedAt(Date.from(issuedAt))
                .expiration(Date.from(issuedAt.plus(jwtProperties.validity())))
                .signWith(signingKey)
                .compact();
        return new IssuedAccessToken(value, jwtProperties.validity());
    }

    public Long parseMemberId(String accessToken) {
        try {
            return Long.valueOf(parseSubject(accessToken));
        } catch (JwtException | IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.UNAUTHENTICATED, INVALID_TOKEN_MESSAGE, exception);
        }
    }

    private String parseSubject(String accessToken) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .clock(() -> Date.from(clock.instant()))
                .build()
                .parseSignedClaims(accessToken)
                .getPayload()
                .getSubject();
    }
}
