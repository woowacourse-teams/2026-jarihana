package com.project.jarihana.realtime.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.realtime.TestSettings;
import com.project.jarihana.realtime.config.RealtimeEnvironment;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.util.Base64;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.Test;

class AdmissionTokenVerifierTest {
    private static final SecretKey KEY = Keys.hmacShaKeyFor(Base64.getUrlDecoder().decode(TestSettings.DEV_TOKEN_KEY));
    private static final SecretKey PROD_KEY = Keys.hmacShaKeyFor(Base64.getUrlDecoder().decode(TestSettings.PROD_TOKEN_KEY));
    private static final String DEV_ISSUER = "jarihana-api-dev";
    private static final String PROD_ISSUER = "jarihana-api-prod";
    private final TestSettings.MutableClock clock = new TestSettings.MutableClock();
    private final AdmissionTokenVerifier verifier = new AdmissionTokenVerifier(
            TestSettings.properties(TestSettings.DEV_TOKEN_KEY, TestSettings.PROD_TOKEN_KEY), clock);

    @Test
    void verifiesExplicitIssuerAudienceAndRoomScope() {
        var result = verifier.verify(token(KEY, "jarihana-realtime", DEV_ISSUER, 61000));
        assertThat(result.environment()).isEqualTo(RealtimeEnvironment.DEV);
        assertThat(result.memberId()).isEqualTo("1");
        assertThat(result.roomId()).isEqualTo("7");
        var production = verifier.verify(token(PROD_KEY, "jarihana-realtime", PROD_ISSUER, 61000));
        assertThat(production.environment()).isEqualTo(RealtimeEnvironment.PROD);
    }

    @Test
    void rejectsExpiredToken() {
        clock.set(62000);
        assertThatThrownBy(() -> verifier.verify(token(KEY, "jarihana-realtime", DEV_ISSUER, 61000))).hasMessage("INVALID_TOKEN");
    }

    @Test
    void rejectsWrongAudienceIssuerAndSignature() {
        assertThatThrownBy(() -> verifier.verify(token(KEY, "other-service", DEV_ISSUER, 61000))).hasMessage("INVALID_TOKEN");
        assertThatThrownBy(() -> verifier.verify(token(KEY, "jarihana-realtime", "other-api", 61000))).hasMessage("INVALID_TOKEN");
        assertThatThrownBy(() -> verifier.verify(token(KEY, "jarihana-realtime", "jarihana-api", 61000))).hasMessage("INVALID_TOKEN");
        assertThatThrownBy(() -> verifier.verify(token(KEY, "jarihana-realtime", PROD_ISSUER, 61000))).hasMessage("INVALID_TOKEN");
        assertThatThrownBy(() -> verifier.verify(token(PROD_KEY, "jarihana-realtime", DEV_ISSUER, 61000))).hasMessage("INVALID_TOKEN");
    }

    @Test
    void rejectsSharedSigningKeysAcrossEnvironments() {
        var properties = TestSettings.properties(TestSettings.DEV_TOKEN_KEY, TestSettings.DEV_TOKEN_KEY);
        assertThatThrownBy(() -> new AdmissionTokenVerifier(properties, clock))
                .hasMessage("Realtime dev and prod require different signing keys");
    }

    @Test
    void rejectsMissingScopeAndLongLivedToken() {
        String missingRoom = Jwts.builder().issuer(DEV_ISSUER).audience().add("jarihana-realtime").and().subject("1")
                .id(UUID.randomUUID().toString()).issuedAt(new Date(1000)).expiration(new Date(61000)).signWith(KEY, Jwts.SIG.HS256).compact();
        assertThatThrownBy(() -> verifier.verify(missingRoom)).hasMessage("INVALID_TOKEN");
        assertThatThrownBy(() -> verifier.verify(token(KEY, "jarihana-realtime", DEV_ISSUER, 300000))).hasMessage("INVALID_TOKEN");
    }

    private static String token(SecretKey key, String audience, String issuer, long expiry) {
        return Jwts.builder().issuer(issuer).audience().add(audience).and().subject("1").claim("roomId", "7")
                .id(UUID.randomUUID().toString()).issuedAt(new Date(1000)).expiration(new Date(expiry)).signWith(key, Jwts.SIG.HS256).compact();
    }
}
