package com.project.jarihana.realtime.auth;

import com.project.jarihana.realtime.config.RealtimeProperties;
import com.project.jarihana.realtime.config.RealtimeEnvironment;
import com.project.jarihana.realtime.room.domain.RuleViolation;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.JwtParser;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.Base64;
import java.util.Date;
import java.util.EnumMap;
import java.util.Map;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Component;

@Component
public final class AdmissionTokenVerifier {
    public record Identity(RealtimeEnvironment environment, String memberId, String roomId, String tokenId, long expiresAt) {}
    private final Map<RealtimeEnvironment, JwtParser> parsers = new EnumMap<>(RealtimeEnvironment.class);
    private final Clock clock;

    public AdmissionTokenVerifier(RealtimeProperties properties, Clock clock) {
        this.clock = clock;
        if (!properties.enabled()) return;
        SecretKey devKey = readKey(properties.dev().tokenKey());
        SecretKey prodKey = readKey(properties.prod().tokenKey());
        if (MessageDigest.isEqual(devKey.getEncoded(), prodKey.getEncoded())) {
            throw new IllegalArgumentException("Realtime dev and prod require different signing keys");
        }
        parsers.put(RealtimeEnvironment.DEV, parser(RealtimeEnvironment.DEV, devKey));
        parsers.put(RealtimeEnvironment.PROD, parser(RealtimeEnvironment.PROD, prodKey));
    }

    private static SecretKey readKey(String tokenKey) {
        byte[] key;
        try {
            key = Base64.getUrlDecoder().decode(tokenKey);
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("Realtime token key must be base64url");
        }
        if (key.length != 32) throw new IllegalArgumentException("Realtime token key must contain 32 bytes");
        return Keys.hmacShaKeyFor(key);
    }

    private JwtParser parser(RealtimeEnvironment environment, SecretKey key) {
        return Jwts.parser().verifyWith(key).requireIssuer(environment.issuer()).requireAudience("jarihana-realtime")
                .clock(() -> Date.from(clock.instant())).build();
    }

    public Identity verify(String token) {
        if (parsers.isEmpty()) throw new RuleViolation("REALTIME_UNAVAILABLE");
        for (var entry : parsers.entrySet()) {
            try {
                var signed = entry.getValue().parseSignedClaims(token);
                if (!signed.getHeader().getAlgorithm().equals("HS256")) throw new RuleViolation("INVALID_TOKEN");
                return identity(entry.getKey(), signed.getPayload());
            } catch (JwtException | IllegalArgumentException error) {
                // The other environment has its own key and required issuer.
            }
        }
        throw new RuleViolation("INVALID_TOKEN");
    }

    private Identity identity(RealtimeEnvironment environment, Claims claims) {
        String roomId = claims.get("roomId", String.class), memberId = claims.getSubject();
        if (roomId == null || memberId == null || !roomId.matches("[1-9][0-9]{0,18}") || !memberId.matches("[1-9][0-9]{0,18}") ||
                claims.getExpiration() == null || claims.getIssuedAt() == null || claims.getId() == null ||
                claims.getId().length() > 128 || claims.getExpiration().getTime() - claims.getIssuedAt().getTime() > 120000 ||
                claims.getIssuedAt().getTime() > clock.millis() + 5000) {
            throw new RuleViolation("INVALID_TOKEN");
        }
        Long.parseLong(roomId);
        Long.parseLong(memberId);
        return new Identity(environment, memberId, roomId, claims.getId(), claims.getExpiration().getTime());
    }
}
