package com.project.jarihana.invitation.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.member.domain.Member;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

@Getter
@Entity
@Table(name = "invitation", uniqueConstraints = {
        @UniqueConstraint(name = "uk_invitation_inviter_request", columnNames = {"inviter_member_id", "request_id"}),
        @UniqueConstraint(name = "uk_invitation_token_hash", columnNames = "token_hash")
})
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Invitation extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false)
    private Group group;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "inviter_member_id", nullable = false)
    private Member inviterMember;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_member_id")
    private Member targetMember;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 20)
    private InvitationType type;

    @Column(name = "request_id", nullable = false)
    private UUID requestId;

    @Column(name = "token_hash", length = 64)
    private String tokenHash;

    @Column(name = "encrypted_token", length = 512)
    private String encryptedToken;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    private Invitation(Group group, Member inviter, Member target, InvitationType type, UUID requestId, String tokenHash, String encryptedToken, LocalDateTime issuedAt) {
        super(require(issuedAt, "발급 시각"));
        this.group = require(group, "모임");
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "ACTIVE 모임에만 초대를 발급할 수 있습니다.");
        }
        this.inviterMember = require(inviter, "발급자");
        this.type = type;
        this.requestId = require(requestId, "발급 요청 식별자");
        this.targetMember = target;
        this.tokenHash = tokenHash;
        this.encryptedToken = encryptedToken;
        this.expiresAt = type == InvitationType.LINK ? issuedAt.plusDays(3) : null;
        if (type == InvitationType.DIRECT) {
            require(target, "초대 대상");
            if (inviter.equals(target)) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "자신에게 초대를 발급할 수 없습니다.");
            }
            return;
        }
        if (tokenHash == null || !tokenHash.matches("[0-9a-f]{64}")) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "공유 초대의 토큰 해시 형식이 올바르지 않습니다.");
        }
        if (encryptedToken == null || encryptedToken.isBlank() || encryptedToken.length() > 512) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "공유 초대의 암호화 토큰 저장값이 필요합니다.");
        }
    }

    public static Invitation issueDirect(Group group, Member inviter, Member target, UUID requestId, LocalDateTime issuedAt) {
        return new Invitation(group, inviter, target, InvitationType.DIRECT, requestId, null, null, issuedAt);
    }

    public static Invitation issueLink(Group group, Member inviter, UUID requestId,
                                       String tokenHash, String encryptedToken, LocalDateTime issuedAt) {
        return new Invitation(group, inviter, null, InvitationType.LINK, requestId, tokenHash, encryptedToken, issuedAt);
    }

    private Invitation(Invitation source, LocalDateTime revokedAt) {
        super(source.getCreatedAt());
        this.id = source.id;
        this.group = source.group;
        this.inviterMember = source.inviterMember;
        this.targetMember = source.targetMember;
        this.type = source.type;
        this.requestId = source.requestId;
        this.tokenHash = source.tokenHash;
        this.encryptedToken = source.encryptedToken;
        this.expiresAt = source.expiresAt;
        this.revokedAt = revokedAt;
    }

    public Invitation revoke(LocalDateTime now) {
        require(now, "취소 시각");
        if (now.isBefore(getCreatedAt())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "취소 시각은 발급 시각보다 이를 수 없습니다.");
        }
        return revokedAt == null ? new Invitation(this, now) : this;
    }

    private static <T> T require(T value, String name) {
        if (value == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, name + "은 필수입니다.");
        }
        return value;
    }

    @Override
    public boolean equals(Object object) {
        if (this == object) return true;
        return object instanceof Invitation other && id != null && other.id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }
}
