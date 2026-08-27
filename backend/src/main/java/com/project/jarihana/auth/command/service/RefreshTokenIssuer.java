package com.project.jarihana.auth.command.service;

import com.project.jarihana.auth.command.repository.RefreshTokenRepository;
import com.project.jarihana.auth.command.service.dto.IssuedRefreshToken;
import com.project.jarihana.auth.config.AuthProperties;
import com.project.jarihana.auth.domain.RefreshToken;
import com.project.jarihana.member.domain.Member;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Base64;

@Service
public class RefreshTokenIssuer {

    private static final int TOKEN_BYTE_LENGTH = 32;

    private final SecureRandom secureRandom = new SecureRandom();

    private final RefreshTokenRepository refreshTokenRepository;
    private final RefreshTokenHasher refreshTokenHasher;
    private final AuthProperties authProperties;
    private final Clock clock;

    public RefreshTokenIssuer(
            RefreshTokenRepository refreshTokenRepository,
            RefreshTokenHasher refreshTokenHasher,
            AuthProperties authProperties,
            Clock clock
    ) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.refreshTokenHasher = refreshTokenHasher;
        this.authProperties = authProperties;
        this.clock = clock;
    }

    @Transactional
    public IssuedRefreshToken issue(Member member) {
        String tokenValue = generateTokenValue();
        LocalDateTime expiresAt = LocalDateTime.now(clock).plus(authProperties.refreshTokenValidity());
        refreshTokenRepository.save(RefreshToken.issue(member, refreshTokenHasher.hash(tokenValue), expiresAt));
        return new IssuedRefreshToken(tokenValue, authProperties.refreshTokenValidity());
    }

    private String generateTokenValue() {
        byte[] tokenBytes = new byte[TOKEN_BYTE_LENGTH];
        secureRandom.nextBytes(tokenBytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
    }
}
