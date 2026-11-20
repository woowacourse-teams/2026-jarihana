package com.project.jarihana.auth.command.service;

import com.project.jarihana.auth.command.repository.RefreshTokenFamilyRepository;
import com.project.jarihana.auth.command.repository.RefreshTokenRepository;
import com.project.jarihana.auth.config.AuthProperties;
import com.project.jarihana.auth.domain.RefreshToken;
import com.project.jarihana.auth.domain.RefreshTokenFamily;
import com.project.jarihana.auth.token.IssuedRefreshToken;
import com.project.jarihana.member.domain.Member;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;

@Service
public class RefreshTokenIssuer {

    private static final int TOKEN_BYTE_LENGTH = 32;

    private final SecureRandom secureRandom = new SecureRandom();

    private final RefreshTokenRepository refreshTokenRepository;
    private final RefreshTokenFamilyRepository refreshTokenFamilyRepository;
    private final RefreshTokenHasher refreshTokenHasher;
    private final AuthProperties authProperties;
    private final Clock clock;

    public RefreshTokenIssuer(
            RefreshTokenRepository refreshTokenRepository,
            RefreshTokenFamilyRepository refreshTokenFamilyRepository,
            RefreshTokenHasher refreshTokenHasher,
            AuthProperties authProperties,
            Clock clock
    ) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.refreshTokenFamilyRepository = refreshTokenFamilyRepository;
        this.refreshTokenHasher = refreshTokenHasher;
        this.authProperties = authProperties;
        this.clock = clock;
    }

    /**
     * 로그인할 때마다 새 패밀리를 연다. 절대 만료는 이때 정하고 회전해도 늘리지 않는다.
     */
    @Transactional
    public IssuedRefreshToken issue(Member member) {
        LocalDateTime now = LocalDateTime.now(clock);
        RefreshTokenFamily family = refreshTokenFamilyRepository.save(
                RefreshTokenFamily.create(member, now.plus(authProperties.refreshTokenValidity())));
        return issueInto(family, now);
    }

    /**
     * 회전으로 같은 패밀리에 다음 토큰을 발급한다. 만료는 패밀리의 절대 만료를 그대로 물려받는다.
     */
    @Transactional
    public IssuedRefreshToken issueInto(RefreshTokenFamily family, LocalDateTime now) {
        String tokenValue = generateTokenValue();
        LocalDateTime expiresAt = family.getAbsoluteExpiresAt();
        refreshTokenRepository.save(RefreshToken.issue(family, refreshTokenHasher.hash(tokenValue), expiresAt));
        return new IssuedRefreshToken(tokenValue, Duration.between(now, expiresAt));
    }

    /**
     * 패밀리 없이 저장된 이전 행을 처음 회전할 때, 그 행의 원래 만료를 절대 만료로 하는 패밀리에 넣는다.
     * 같은 행으로 동시에 온 요청 중 회전에 성공한 요청만 불러 패밀리가 둘 생기지 않는다.
     */
    @Transactional
    public RefreshTokenFamily adoptIntoNewFamily(
            RefreshToken legacyToken,
            LocalDateTime originalExpiresAt,
            LocalDateTime now
    ) {
        RefreshTokenFamily family = refreshTokenFamilyRepository.save(
                RefreshTokenFamily.create(legacyToken.getMember(), originalExpiresAt));
        refreshTokenRepository.attachFamily(legacyToken.getId(), family, now);
        return family;
    }

    private String generateTokenValue() {
        byte[] tokenBytes = new byte[TOKEN_BYTE_LENGTH];
        secureRandom.nextBytes(tokenBytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
    }
}
