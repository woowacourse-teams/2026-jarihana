package com.project.jarihana.invitation.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class InvitationTest {
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 11, 14, 0);
    private final Group group = Group.createClub("초대 모임", "함께해요", null, null, null, NOW);
    private final Member inviter = Member.create("우주", 8, "100", Course.BACKEND);
    private final Member target = Member.create("마루", 8, "101", Course.FRONTEND);

    @Test
    @DisplayName("취소는 기존 초대를 바꾸지 않고 최초 취소 시각을 가진 새 초대를 반환하며 재취소는 최초 시각을 유지한다.")
    void revocationIsImmutableAndKeepsFirstRevokedAt() {
        // Given
        Invitation invitation = Invitation.issueLink(group, inviter, UUID.randomUUID(), "a".repeat(64), "encrypted", NOW);

        // When
        Invitation revoked = invitation.revoke(NOW.plusMinutes(1));
        Invitation repeated = revoked.revoke(NOW.plusMinutes(2));

        // Then
        assertThat(invitation.getRevokedAt()).isNull();
        assertThat(revoked).isNotSameAs(invitation);
        assertThat(revoked.getRevokedAt()).isEqualTo(NOW.plusMinutes(1));
        assertThat(repeated).isSameAs(revoked);
        assertThat(revoked.getCreatedAt()).isEqualTo(invitation.getCreatedAt());
        assertThat(revoked.getExpiresAt()).isEqualTo(invitation.getExpiresAt());
        assertThat(revoked.getRequestId()).isEqualTo(invitation.getRequestId());
        assertThat(revoked.getEncryptedToken()).isEqualTo(invitation.getEncryptedToken());
        assertThatThrownBy(() -> invitation.revoke(null)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> invitation.revoke(NOW.minusSeconds(1))).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("지정 초대는 대상 회원을 가지며 모집 공고와 시간 만료를 요구하지 않는다.")
    void directInvitationHasTargetWithoutRecruitmentOrExpiry() {
        // Given
        UUID requestId = UUID.randomUUID();
        // When
        Invitation invitation = Invitation.issueDirect(group, inviter, target, requestId, NOW);
        // Then
        assertThat(invitation.getType()).isEqualTo(InvitationType.DIRECT);
        assertThat(invitation.getTargetMember()).isSameAs(target);
        assertThat(invitation.getExpiresAt()).isNull();
        assertThat(invitation.getTokenHash()).isNull();
        assertThat(invitation.getEncryptedToken()).isNull();
        assertThat(invitation.getRequestId()).isEqualTo(requestId);
        assertThat(invitation.getCreatedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("공유 초대는 대상 없이 만료 시각과 토큰 검증·복원용 저장값을 가진다.")
    void linkInvitationHasExpiryAndRecoverableTokenStorage() {
        // Given
        String hash = "a".repeat(64);
        // When
        Invitation invitation = Invitation.issueLink(group, inviter, UUID.randomUUID(), hash, "encrypted-value", NOW);
        // Then
        assertThat(invitation.getType()).isEqualTo(InvitationType.LINK);
        assertThat(invitation.getTargetMember()).isNull();
        assertThat(invitation.getExpiresAt()).isEqualTo(NOW.plusDays(3));
        assertThat(invitation.getTokenHash()).isEqualTo(hash);
        assertThat(invitation.getEncryptedToken()).isEqualTo("encrypted-value");
    }

    @Test
    @DisplayName("지정 초대는 자신을 대상으로 하거나 대상 없이 발급할 수 없다.")
    void directInvitationRequiresAnotherMember() {
        // Given
        UUID requestId = UUID.randomUUID();
        // When & Then
        assertThatThrownBy(() -> Invitation.issueDirect(group, inviter, inviter, requestId, NOW))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> Invitation.issueDirect(group, inviter, null, requestId, NOW))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("공유 초대는 토큰 해시와 복원용 저장값을 모두 요구한다.")
    void linkInvitationRequiresBothTokenStorageValues() {
        // Given
        UUID requestId = UUID.randomUUID();
        // When & Then
        assertThatThrownBy(() -> Invitation.issueLink(group, inviter, requestId, "bad", "encrypted-value", NOW))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> Invitation.issueLink(group, inviter, requestId, "a".repeat(64), " ", NOW))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("초대 발급은 재시도 식별자인 requestId 없이 생성할 수 없다.")
    void invitationRequiresRequestId() {
        // When & Then
        assertThatThrownBy(() -> Invitation.issueDirect(group, inviter, target, null, NOW))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> Invitation.issueLink(group, inviter, null, "a".repeat(64), "encrypted-value", NOW))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("수락 이력은 모집 신청 없이 초대와 수락 회원을 연결한다.")
    void acceptanceConnectsInvitationAndMemberWithoutRegistration() {
        // Given
        Invitation invitation = Invitation.issueDirect(group, inviter, target, UUID.randomUUID(), NOW);
        // When
        InvitationAcceptance acceptance = InvitationAcceptance.create(invitation, target, NOW.plusHours(1));
        // Then
        assertThat(acceptance.getInvitation()).isSameAs(invitation);
        assertThat(acceptance.getMember()).isSameAs(target);
        assertThat(acceptance.getAcceptedAt()).isEqualTo(NOW.plusHours(1));
        assertThatThrownBy(() -> InvitationAcceptance.create(invitation, inviter, NOW.plusHours(1)))
                .isInstanceOf(BusinessException.class);
    }
}
