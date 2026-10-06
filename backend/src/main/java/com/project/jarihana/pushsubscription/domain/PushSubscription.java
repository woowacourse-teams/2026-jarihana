package com.project.jarihana.pushsubscription.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Member;
import jakarta.persistence.CheckConstraint;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

import java.math.BigInteger;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.spec.ECFieldFp;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Base64;
import java.util.Objects;

@Getter
@Entity
@Table(name = "push_subscriptions",
        uniqueConstraints = @UniqueConstraint(name = "uq_push_subscriptions_endpoint", columnNames = "endpoint"),
        check = @CheckConstraint(name = "ck_push_subscriptions_connection",
                constraint = "generation > 0 AND octet_length(endpoint) BETWEEN 1 AND 2048"
                        + " AND ((enabled AND disabled_at IS NULL) OR (NOT enabled AND disabled_at IS NOT NULL))"))
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PushSubscription extends BaseEntity {

    private static final ECParameterSpec P256 = p256Parameters();

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false, updatable = false)
    private Member member;

    @Column(name = "endpoint", nullable = false, length = 2048, updatable = false)
    private String endpoint;

    @Column(name = "p256dh", nullable = false, length = 128)
    private String p256dh;

    @Column(name = "auth", nullable = false, length = 64)
    private String auth;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    @Column(name = "generation", nullable = false)
    private long generation;

    @Column(name = "last_seen_at", nullable = false)
    private LocalDateTime lastSeenAt;

    @Column(name = "disabled_at")
    private LocalDateTime disabledAt;

    private PushSubscription(Long id, Member member, String endpoint, String p256dh, String auth, boolean enabled,
                             long generation, LocalDateTime lastSeenAt, LocalDateTime disabledAt, LocalDateTime createdAt) {
        super(Objects.requireNonNull(createdAt));
        this.id = id;
        this.member = Objects.requireNonNull(member);
        this.endpoint = validateEndpoint(endpoint);
        this.p256dh = validateKey(p256dh, 65);
        this.auth = validateKey(auth, 16);
        this.enabled = enabled;
        this.generation = generation;
        this.lastSeenAt = Objects.requireNonNull(lastSeenAt);
        this.disabledAt = disabledAt;
    }

    public static PushSubscription create(Member member, String endpoint, String p256dh, String auth, LocalDateTime now) {
        return new PushSubscription(null, member, endpoint, p256dh, auth, true, 1, now, null, now);
    }

    public PushSubscription reconnect(String p256dh, String auth, LocalDateTime now) {
        String validatedPublicKey = validateKey(p256dh, 65);
        String validatedAuth = validateKey(auth, 16);
        boolean connectionChanged = !enabled || !this.p256dh.equals(validatedPublicKey) || !this.auth.equals(validatedAuth);
        long nextGeneration = connectionChanged ? Math.incrementExact(generation) : generation;
        return new PushSubscription(id, member, endpoint, validatedPublicKey, validatedAuth, true,
                nextGeneration, now, null, getCreatedAt());
    }

    public PushSubscription disable(LocalDateTime now) {
        if (!enabled) {
            return this;
        }
        return new PushSubscription(id, member, endpoint, p256dh, auth, false,
                Math.incrementExact(generation), lastSeenAt, Objects.requireNonNull(now), getCreatedAt());
    }

    private static String validateEndpoint(String endpoint) {
        if (endpoint == null || endpoint.getBytes(StandardCharsets.UTF_8).length > 2048) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "푸시 주소는 UTF-8 기준 1바이트부터 2048바이트까지여야 합니다.");
        }
        try {
            URI uri = new URI(endpoint);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                    || (uri.getPort() != -1 && uri.getPort() != 443)
                    || uri.getRawUserInfo() != null || uri.getRawFragment() != null) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "푸시 주소는 인증 정보와 fragment가 없는 HTTPS 443 주소여야 합니다.");
            }
        } catch (URISyntaxException exception) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "푸시 주소 형식이 유효하지 않습니다.");
        }
        return endpoint;
    }

    private static String validateKey(String value, int expectedBytes) {
        if (value == null || !value.matches("[A-Za-z0-9_-]+={0,2}")) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "푸시 암호화 키는 Base64URL 형식이어야 합니다.");
        }
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(value);
            if (decoded.length != expectedBytes || (expectedBytes == 65 && decoded[0] != 4)) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "푸시 암호화 키 길이 또는 공개키 형식이 유효하지 않습니다.");
            }
            if (expectedBytes == 65) {
                validatePublicKeyPoint(decoded);
            }
            return Base64.getUrlEncoder().withoutPadding().encodeToString(decoded);
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "푸시 암호화 키는 Base64URL 형식이어야 합니다.");
        }
    }

    private static void validatePublicKeyPoint(byte[] decoded) {
        BigInteger x = new BigInteger(1, Arrays.copyOfRange(decoded, 1, 33));
        BigInteger y = new BigInteger(1, Arrays.copyOfRange(decoded, 33, 65));
        BigInteger prime = ((ECFieldFp) P256.getCurve().getField()).getP();
        BigInteger expected = x.pow(3).add(P256.getCurve().getA().multiply(x)).add(P256.getCurve().getB()).mod(prime);
        if (x.compareTo(prime) >= 0 || y.compareTo(prime) >= 0 || !y.pow(2).mod(prime).equals(expected)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "푸시 공개키는 P-256 곡선 위의 점이어야 합니다.");
        }
    }

    private static ECParameterSpec p256Parameters() {
        try {
            AlgorithmParameters parameters = AlgorithmParameters.getInstance("EC");
            parameters.init(new ECGenParameterSpec("secp256r1"));
            return parameters.getParameterSpec(ECParameterSpec.class);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("P-256 파라미터를 사용할 수 없습니다.", exception);
        }
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
        if (!(object instanceof PushSubscription other)) {
            return false;
        }
        return id != null && other.id != null && id.equals(other.id);
    }
}
