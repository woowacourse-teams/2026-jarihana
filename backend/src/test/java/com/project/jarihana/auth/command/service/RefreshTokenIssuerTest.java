package com.project.jarihana.auth.command.service;

import com.project.jarihana.auth.command.repository.RefreshTokenRepository;
import com.project.jarihana.auth.config.AuthProperties;
import com.project.jarihana.auth.domain.RefreshToken;
import com.project.jarihana.auth.token.IssuedRefreshToken;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class RefreshTokenIssuerTest extends IntegrationTestSupport {

    @Autowired
    private RefreshTokenIssuer refreshTokenIssuer;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private RefreshTokenRepository refreshTokenRepository;

    @Autowired
    private AuthProperties authProperties;

    @DisplayName("발급한 Refresh Token은 원문이 아니라 해시로 저장한다.")
    @Test
    void storeRefreshTokenAsHash() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, "123456", Course.BACKEND));

        // When
        IssuedRefreshToken issued = refreshTokenIssuer.issue(member);

        // Then
        assertThat(issued.value()).isNotBlank();
        List<RefreshToken> refreshTokens = refreshTokenRepository.findAll();
        assertThat(refreshTokens).hasSize(1);
        assertThat(refreshTokens.get(0).getTokenHash())
                .isNotEqualTo(issued.value())
                .hasSize(64);
        assertThat(refreshTokenRepository.findByTokenHash(issued.value())).isEmpty();
    }

    @DisplayName("Refresh Token의 만료 시각은 주입한 시계와 설정한 유효 기간을 따른다.")
    @Test
    void expireRefreshTokenByConfiguredValidity() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, "123456", Course.BACKEND));

        // When
        IssuedRefreshToken issued = refreshTokenIssuer.issue(member);

        // Then
        assertThat(issued.validity()).isEqualTo(authProperties.refreshTokenValidity());
        assertThat(refreshTokenRepository.findAll().get(0).getExpiresAt())
                .isEqualTo(TestSupportConfig.FIXED_NOW.plus(authProperties.refreshTokenValidity()));
    }

    @DisplayName("Refresh Token은 발급할 때마다 다른 값을 가진다.")
    @Test
    void issueDifferentRefreshTokenEachTime() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, "123456", Course.BACKEND));

        // When
        IssuedRefreshToken first = refreshTokenIssuer.issue(member);
        IssuedRefreshToken second = refreshTokenIssuer.issue(member);

        // Then
        assertThat(first.value()).isNotEqualTo(second.value());
        assertThat(refreshTokenRepository.findAll()).hasSize(2);
    }
}
