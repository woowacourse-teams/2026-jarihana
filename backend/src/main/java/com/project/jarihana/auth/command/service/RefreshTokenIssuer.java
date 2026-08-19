package com.project.jarihana.auth.command.service;

import com.project.jarihana.auth.command.repository.RefreshTokenRepository;
import com.project.jarihana.auth.command.service.dto.IssuedRefreshToken;
import com.project.jarihana.auth.config.AuthProperties;
import com.project.jarihana.auth.domain.RefreshToken;
import com.project.jarihana.member.domain.Member;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RefreshTokenIssuer {

    private static final String HASH_ALGORITHM = "SHA-256";
    private static final int TOKEN_BYTE_LENGTH = 32;

    private final SecureRandom secureRandom = new SecureRandom();

    private final RefreshTokenRepository refreshTokenRepository;
    private final AuthProperties authProperties;
    private final Clock clock;

    public RefreshTokenIssuer(
            RefreshTokenRepository refreshTokenRepository,
            AuthProperties authProperties,
            Clock clock
    ) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.authProperties = authProperties;
        this.clock = clock;
    }

    @Transactional
    public IssuedRefreshToken issue(Member member) {
        String tokenValue = generateTokenValue();
        LocalDateTime expiresAt = LocalDateTime.now(clock).plus(authProperties.refreshTokenValidity());
        refreshTokenRepository.save(RefreshToken.issue(member, hash(tokenValue), expiresAt));
        return new IssuedRefreshToken(tokenValue, authProperties.refreshTokenValidity());
    }

    private String generateTokenValue() {
        byte[] tokenBytes = new byte[TOKEN_BYTE_LENGTH];
        secureRandom.nextBytes(tokenBytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
    }

    private String hash(String tokenValue) {
        try {
            MessageDigest messageDigest = MessageDigest.getInstance(HASH_ALGORITHM);
            byte[] hashed = messageDigest.digest(tokenValue.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashed);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Refresh Token 해시 알고리즘을 사용할 수 없습니다.", exception);
        }
    }
}
