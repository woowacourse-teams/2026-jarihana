package com.project.jarihana.auth.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
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
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;

/**
 * 로그인 하나에서 회전으로 이어지는 Refresh Token들의 묶음이다. 회전된 토큰이 다시 오면 누가 사본을
 * 가졌는지 알 수 없으므로 최신 토큰까지 이 단위로 함께 폐기한다.
 *
 * <p>폐기는 같은 패밀리로 동시에 오는 요청과 경합하므로 엔티티 상태 전이가 아니라 저장소의 조건부
 * UPDATE로 기록한다.
 */
@Entity
@Table(name = "refresh_token_family")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RefreshTokenFamily extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(name = "absolute_expires_at", nullable = false)
    private LocalDateTime absoluteExpiresAt;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "revoke_reason", length = 20)
    private RefreshTokenRevokeReason revokeReason;

    private RefreshTokenFamily(Member member, LocalDateTime absoluteExpiresAt) {
        this.member = require(member, "회원");
        this.absoluteExpiresAt = require(absoluteExpiresAt, "절대 만료 시각");
    }

    private static <T> T require(T value, String fieldName) {
        if (value == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, fieldName + "은 필수입니다.");
        }
        return value;
    }

    /**
     * 회전한 토큰은 이 절대 만료를 그대로 물려받는다. 회전이 만료를 늘리면 체인을 차지한 사본이 끝없이
     * 살아남는다.
     */
    public static RefreshTokenFamily create(Member member, LocalDateTime absoluteExpiresAt) {
        return new RefreshTokenFamily(member, absoluteExpiresAt);
    }

    public boolean isUsableAt(LocalDateTime now) {
        return revokedAt == null && now.isBefore(absoluteExpiresAt);
    }

    public Long getId() {
        return id;
    }

    public Member getMember() {
        return member;
    }

    public LocalDateTime getAbsoluteExpiresAt() {
        return absoluteExpiresAt;
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public boolean equals(Object object) {
        if (this == object) {
            return true;
        }
        if (!(object instanceof RefreshTokenFamily other)) {
            return false;
        }
        if (id == null || other.id == null) {
            return false;
        }
        return id.equals(other.id);
    }
}
