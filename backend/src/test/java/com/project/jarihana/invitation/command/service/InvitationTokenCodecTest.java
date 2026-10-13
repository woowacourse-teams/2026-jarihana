package com.project.jarihana.invitation.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.invitation.config.InvitationTokenProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class InvitationTokenCodecTest {
    @Test
    @DisplayName("공유 토큰은 충분한 무작위 값으로 발급하고 해시와 인증된 암호문으로만 저장한다.")
    void issueRandomTokensAndRecoverAuthenticatedCiphertext() {
        // Given
        InvitationTokenCodec codec = codec("first", Map.of("first", key()));

        // When
        var first = codec.issue();
        var second = codec.issue();

        // Then
        assertThat(first.raw()).matches("[A-Za-z0-9_-]{43}");
        assertThat(second.raw()).isNotEqualTo(first.raw());
        assertThat(first.hash()).matches("[0-9a-f]{64}").isEqualTo(codec.hash(first.raw()));
        assertThat(first.encrypted()).startsWith("first.").doesNotContain(first.raw()).hasSizeLessThan(512);
        assertThat(codec.recover(first.encrypted(), first.hash())).isEqualTo(first.raw());
        assertThatThrownBy(() -> codec.recover(first.encrypted(), second.hash())).isInstanceOf(BusinessException.class);
        String corrupted = first.encrypted().substring(0, first.encrypted().length() - 5) + "AAAAA";
        assertThatThrownBy(() -> codec.recover(corrupted, first.hash())).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("발급 키를 교체해도 보관한 이전 키로 기존 링크를 복원하며 키가 없으면 실패한다.")
    void rotateKeysAndFailClosedForUnavailableConfiguration() {
        // Given
        String oldKey = key();
        String newKey = key();
        var old = codec("old", Map.of("old", oldKey)).issue();
        var rotated = codec("new", Map.of("old", oldKey, "new", newKey));

        // When / Then
        assertThat(rotated.recover(old.encrypted(), old.hash())).isEqualTo(old.raw());
        assertThat(rotated.issue().encrypted()).startsWith("new.");
        assertThatThrownBy(() -> codec("new", Map.of("new", newKey)).recover(old.encrypted(), old.hash()))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> codec("", Map.of()).issue()).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> codec("short", Map.of("short", "AAAA")).issue()).isInstanceOf(BusinessException.class);
    }

    private InvitationTokenCodec codec(String active, Map<String, String> keys) {
        return new InvitationTokenCodec(new InvitationTokenProperties(active, keys));
    }

    private String key() {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        return Base64.getEncoder().encodeToString(key);
    }
}
