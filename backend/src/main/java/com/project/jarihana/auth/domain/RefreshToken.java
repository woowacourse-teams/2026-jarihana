package com.project.jarihana.auth.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Member;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Optional;

@Entity
@Table(
        name = "refresh_token",
        uniqueConstraints = @UniqueConstraint(name = "uk_refresh_token_token_hash", columnNames = "token_hash")
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RefreshToken extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    /**
     * 회전을 도입하기 전 버전이 만든 행은 비어 있다. 새 버전이 처음 회전할 때 패밀리에 넣는다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "refresh_token_family_id")
    private RefreshTokenFamily family;

    /**
     * 비어 있으면 아직 쓰이지 않은 활성 토큰이다. 회전 시각은 같은 토큰으로 동시에 온 요청과 경합하므로
     * 저장소의 조건부 UPDATE로만 기록한다.
     */
    @Column(name = "rotated_at")
    private LocalDateTime rotatedAt;

    private RefreshToken(RefreshTokenFamily family, String tokenHash, LocalDateTime expiresAt) {
        this.family = require(family, "패밀리");
        this.member = require(family.getMember(), "회원");
        this.tokenHash = require(tokenHash, "토큰 해시");
        this.expiresAt = require(expiresAt, "만료 시각");
    }

    private static <T> T require(T value, String fieldName) {
        if (value == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, fieldName + "은 필수입니다.");
        }
        return value;
    }

    public static RefreshToken issue(RefreshTokenFamily family, String tokenHash, LocalDateTime expiresAt) {
        return new RefreshToken(family, tokenHash, expiresAt);
    }

    public boolean isExpired(LocalDateTime now) {
        return !now.isBefore(expiresAt);
    }

    /**
     * 패밀리가 없는 이전 행은 자기 {@code expiresAt}이 절대 만료 역할을 하므로 여기서는 막지 않는다.
     */
    public boolean isFamilyUsableAt(LocalDateTime now) {
        return family == null || family.isUsableAt(now);
    }

    public boolean isRotated() {
        return rotatedAt != null;
    }

    /**
     * 탭 여러 개가 같은 쿠키로 거의 동시에 갱신한 경우처럼 회전 직후의 재제출은 사본의 증거로 보지 않는다.
     */
    public boolean isWithinReuseGraceAt(LocalDateTime now, Duration reuseGrace) {
        return isRotated() && now.isBefore(rotatedAt.plus(reuseGrace));
    }

    public Optional<RefreshTokenFamily> findFamily() {
        return Optional.ofNullable(family);
    }

    public LocalDateTime getRotatedAt() {
        return rotatedAt;
    }

    public Long getId() {
        return id;
    }

    public Member getMember() {
        return member;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public LocalDateTime getExpiresAt() {
        return expiresAt;
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
        if (!(object instanceof RefreshToken other)) {
            return false;
        }
        if (id == null || other.id == null) {
            return false;
        }
        return id.equals(other.id);
    }
}
