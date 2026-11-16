package com.project.jarihana.auth.token;

import com.project.jarihana.auth.config.JwtProperties;
import com.project.jarihana.auth.config.RealtimeProperties;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Clock;
import java.util.Date;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

@Component
public class RealtimeJoinTokenProvider {
    private final RealtimeProperties properties;
    private final Clock clock;
    private final SecretKey signingKey;
    private final String issuer;

    public RealtimeJoinTokenProvider(RealtimeProperties properties, JwtProperties jwtProperties, Clock clock, Environment environment) {
        this.properties = properties;
        this.clock = clock;
        issuer = environment.acceptsProfiles(Profiles.of("prod")) ? "jarihana-api-prod" : "jarihana-api-dev";
        signingKey = deriveSigningKey(jwtProperties.secret(), issuer);
    }

    public IssuedRealtimeJoinToken issue(long memberId, long roomId) {
        long issuedAt = clock.millis();
        long expiresAt = issuedAt + 60_000;
        String token = Jwts.builder().issuer(issuer).audience().add("jarihana-realtime").and()
                .subject(Long.toString(memberId)).claim("roomId", Long.toString(roomId))
                .id(UUID.randomUUID().toString()).issuedAt(new Date(issuedAt)).expiration(new Date(expiresAt))
                .signWith(signingKey, Jwts.SIG.HS256).compact();
        return new IssuedRealtimeJoinToken(token, properties.websocketUrl(), expiresAt);
    }

    private static SecretKey deriveSigningKey(String accessTokenSecret, String issuer) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(accessTokenSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Keys.hmacShaKeyFor(mac.doFinal(("jarihana-realtime:v1:" + issuer).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("실시간 입장 서명 키를 구성하지 못했습니다.", exception);
        }
    }
}
