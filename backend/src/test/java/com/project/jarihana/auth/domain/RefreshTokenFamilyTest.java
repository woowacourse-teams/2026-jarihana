package com.project.jarihana.auth.domain;

import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class RefreshTokenFamilyTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 19, 10, 0);
    private static final Member MEMBER = Member.create("가온", 8, "123456", Course.BACKEND);

    @DisplayName("절대 만료 전의 패밀리는 쓸 수 있다.")
    @Test
    void usableBeforeAbsoluteExpiry() {
        // Given
        RefreshTokenFamily family = RefreshTokenFamily.create(MEMBER, NOW.plusSeconds(1));

        // When
        boolean usable = family.isUsableAt(NOW);

        // Then
        assertThat(usable).isTrue();
    }

    @DisplayName("절대 만료 시각부터는 패밀리를 쓸 수 없다.")
    @Test
    void unusableFromAbsoluteExpiry() {
        // Given
        RefreshTokenFamily family = RefreshTokenFamily.create(MEMBER, NOW);

        // When
        boolean usable = family.isUsableAt(NOW);

        // Then
        assertThat(usable).isFalse();
    }

    @DisplayName("새로 발급한 토큰은 패밀리의 회원과 절대 만료를 따르고 아직 회전되지 않았다.")
    @Test
    void issueActiveTokenInFamily() {
        // Given
        RefreshTokenFamily family = RefreshTokenFamily.create(MEMBER, NOW.plusDays(14));

        // When
        RefreshToken token = RefreshToken.issue(family, "a".repeat(64), family.getAbsoluteExpiresAt());

        // Then
        assertThat(token.getMember()).isSameAs(MEMBER);
        assertThat(token.findFamily()).containsSame(family);
        assertThat(token.isRotated()).isFalse();
        assertThat(token.isWithinReuseGraceAt(NOW, Duration.ofSeconds(10))).isFalse();
        assertThat(token.isFamilyUsableAt(NOW)).isTrue();
    }
}
