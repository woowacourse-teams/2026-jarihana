package com.project.jarihana.pushsubscription.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.security.GeneralSecurityException;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PushSubscriptionTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 3, 10, 0);
    private static final String KEY = publicKey();
    private static final String AUTH = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]);

    @Test
    @DisplayName("동일한 활성 구독을 갱신해도 연결 버전은 유지한다.")
    void sameActiveConnectionKeepsGeneration() {
        // Given
        PushSubscription original = subscription();

        // When
        PushSubscription refreshed = original.reconnect(KEY, AUTH, NOW.plusMinutes(1));

        // Then
        assertThat(refreshed.isEnabled()).isTrue();
        assertThat(refreshed.getGeneration()).isEqualTo(1);
        assertThat(refreshed.getLastSeenAt()).isEqualTo(NOW.plusMinutes(1));
        assertThat(original.getLastSeenAt()).isEqualTo(NOW);
        assertThat(refreshed.getCreatedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("해제와 재연결은 각각 버전을 증가시키고 반복 해제는 유지한다.")
    void disableAndReconnectAdvanceGeneration() {
        // Given
        PushSubscription original = subscription();

        // When
        PushSubscription disabled = original.disable(NOW.plusMinutes(1));
        PushSubscription reconnected = disabled.reconnect(KEY, AUTH, NOW.plusMinutes(2));

        // Then
        assertThat(original.isEnabled()).isTrue();
        assertThat(disabled.isEnabled()).isFalse();
        assertThat(disabled.getGeneration()).isEqualTo(2);
        assertThat(disabled.getDisabledAt()).isEqualTo(NOW.plusMinutes(1));
        assertThat(disabled.disable(NOW.plusMinutes(2))).isSameAs(disabled);
        assertThat(reconnected.isEnabled()).isTrue();
        assertThat(reconnected.getGeneration()).isEqualTo(3);
        assertThat(reconnected.getDisabledAt()).isNull();
        assertThat(reconnected.getMember()).isSameAs(original.getMember());
    }

    @Test
    @DisplayName("암호화 키가 교체되면 활성 구독도 버전을 증가시킨다.")
    void keyRotationAdvancesGeneration() {
        // Given
        PushSubscription original = subscription();
        String replacedAuth = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[]{
                1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0});

        // When
        PushSubscription rotated = original.reconnect(KEY, replacedAuth, NOW.plusMinutes(1));

        // Then
        assertThat(rotated.getGeneration()).isEqualTo(2);
        assertThat(original.getAuth()).isEqualTo(AUTH);
    }

    @Test
    @DisplayName("같은 키의 padding 표현이 달라도 연결 버전을 유지한다.")
    void equivalentKeyEncodingKeepsGeneration() {
        // Given
        PushSubscription original = subscription();
        String paddedKey = Base64.getUrlEncoder().encodeToString(Base64.getUrlDecoder().decode(KEY));
        String paddedAuth = Base64.getUrlEncoder().encodeToString(Base64.getUrlDecoder().decode(AUTH));

        // When
        PushSubscription refreshed = original.reconnect(paddedKey, paddedAuth, NOW.plusMinutes(1));

        // Then
        assertThat(refreshed.getGeneration()).isEqualTo(1);
    }

    @Test
    @DisplayName("길이가 맞더라도 P-256 곡선 위의 점이 아닌 공개키는 거절한다.")
    void rejectPublicKeyOutsideP256Curve() {
        // Given
        byte[] invalidPoint = new byte[65];
        invalidPoint[0] = 4;
        String encoded = Base64.getUrlEncoder().withoutPadding().encodeToString(invalidPoint);
        byte[] outsideField = new byte[65];
        Arrays.fill(outsideField, (byte) 0xff);
        outsideField[0] = 4;

        // When & Then
        assertThatThrownBy(() -> PushSubscription.create(member(), "https://fcm.googleapis.com/x", encoded, AUTH, NOW))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> PushSubscription.create(member(), "https://fcm.googleapis.com/x",
                Base64.getUrlEncoder().withoutPadding().encodeToString(outsideField), AUTH, NOW))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("endpoint 길이는 문자 수 대신 UTF-8 바이트로 제한하고 원문을 유지한다.")
    void limitEndpointByUtf8Bytes() {
        // Given
        String prefix = "https://fcm.googleapis.com/";
        String maximum = prefix + "a".repeat(2048 - prefix.length());

        // When & Then
        assertThat(PushSubscription.create(member(), maximum, KEY, AUTH, NOW).getEndpoint()).isEqualTo(maximum);
        assertThatThrownBy(() -> PushSubscription.create(member(), maximum + "a", KEY, AUTH, NOW))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> PushSubscription.create(member(), prefix + "가".repeat(700), KEY, AUTH, NOW))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("잘못된 키와 안전하지 않은 주소 형식을 거절한다.")
    void rejectInvalidKeysAndEndpointShape() {
        // Given
        String endpoint = "https://fcm.googleapis.com/send/example";

        // When & Then
        assertThatThrownBy(() -> PushSubscription.create(member(), endpoint, "bad", AUTH, NOW))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> PushSubscription.create(member(), endpoint, KEY, "bad", NOW))
                .isInstanceOf(BusinessException.class);
        for (String invalid : new String[]{"http://fcm.googleapis.com/x", "https://fcm.googleapis.com:444/x",
                "https://user@fcm.googleapis.com/x", "https://fcm.googleapis.com/x#fragment"}) {
            assertThatThrownBy(() -> PushSubscription.create(member(), invalid, KEY, AUTH, NOW))
                    .isInstanceOf(BusinessException.class);
        }
    }

    private PushSubscription subscription() {
        return PushSubscription.create(member(), "https://fcm.googleapis.com/send/example", KEY, AUTH, NOW);
    }

    private Member member() {
        return Member.create("우주", 8, "123", Course.BACKEND);
    }

    private static String publicKey() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"));
            ECPublicKey key = (ECPublicKey) generator.generateKeyPair().getPublic();
            byte[] encoded = new byte[65];
            encoded[0] = 4;
            byte[] x = key.getW().getAffineX().toByteArray();
            byte[] y = key.getW().getAffineY().toByteArray();
            System.arraycopy(x, Math.max(0, x.length - 32), encoded, 33 - Math.min(32, x.length), Math.min(32, x.length));
            System.arraycopy(y, Math.max(0, y.length - 32), encoded, 65 - Math.min(32, y.length), Math.min(32, y.length));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(encoded);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
