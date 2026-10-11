package com.project.jarihana.invitation.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class InvitationStatusTest {
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 11, 14, 0);

    @ParameterizedTest
    @CsvSource({
            "DIRECT,false,true,true,false,ACTIVE",
            "DIRECT,false,true,true,true,ACCEPTED",
            "LINK,false,true,true,true,ACTIVE",
            "DIRECT,true,false,false,true,REVOKED",
            "DIRECT,false,false,false,true,GROUP_ENDED",
            "DIRECT,false,true,false,true,EXPIRED"
    })
    @DisplayName("조회 상태는 취소·종료·발급자 이탈을 수락보다 우선하며 공유 링크는 수락으로 소진되지 않는다.")
    void resolveStatusWithLifecyclePrecedence(InvitationType type, boolean revoked, boolean active,
                                              boolean inviterPresent, boolean accepted, InvitationStatus expected) {
        // Given
        LocalDateTime revokedAt = revoked ? NOW : null;

        // When
        InvitationStatus status = InvitationStatus.resolve(type, revokedAt, active, inviterPresent, null, accepted, NOW);

        // Then
        assertThat(status).isEqualTo(expected);
    }

    @Test
    @DisplayName("공유 링크는 만료 직전까지 유효하고 만료 정각부터 만료 상태다.")
    void expireLinkExactlyAtExpiryBoundary() {
        // Given
        LocalDateTime expiresAt = NOW.plusDays(3);

        // When
        InvitationStatus before = InvitationStatus.resolve(InvitationType.LINK, null, true, true, expiresAt, false, expiresAt.minusNanos(1));
        InvitationStatus at = InvitationStatus.resolve(InvitationType.LINK, null, true, true, expiresAt, false, expiresAt);

        // Then
        assertThat(before).isEqualTo(InvitationStatus.ACTIVE);
        assertThat(at).isEqualTo(InvitationStatus.EXPIRED);
    }
}
