package com.project.jarihana.invitation.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.invitation.config.InvitationTokenProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;

@Component
@RequiredArgsConstructor
public class InvitationTokenCodec {
    private final InvitationTokenProperties properties;
    private final SecureRandom random = new SecureRandom();

    public record IssuedToken(String raw, String hash, String encrypted) {
        @Override
        public String toString() { return "IssuedToken[redacted]"; }
    }

    public IssuedToken issue() {
        String keyId = properties.activeKeyId();
        SecretKeySpec key = key(keyId);
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        byte[] nonce = new byte[12];
        random.nextBytes(nonce);
        try {
            Cipher cipher = cipher(Cipher.ENCRYPT_MODE, key, keyId, nonce);
            byte[] ciphertext = cipher.doFinal(raw.getBytes(StandardCharsets.US_ASCII));
            byte[] stored = ByteBuffer.allocate(nonce.length + ciphertext.length).put(nonce).put(ciphertext).array();
            String encrypted = keyId + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(stored);
            return new IssuedToken(raw, hash(raw), encrypted);
        } catch (GeneralSecurityException exception) {
            throw unavailable();
        }
    }

    public String recover(String encrypted, String expectedHash) {
        if (encrypted == null || encrypted.length() > 512 || expectedHash == null) throw unavailable();
        String[] parts = encrypted.split("\\.", -1);
        if (parts.length != 2) throw unavailable();
        SecretKeySpec key = key(parts[0]);
        try {
            byte[] stored = Base64.getUrlDecoder().decode(parts[1]);
            if (stored.length != 71) throw unavailable();
            byte[] nonce = Arrays.copyOfRange(stored, 0, 12);
            String raw = new String(cipher(Cipher.DECRYPT_MODE, key, parts[0], nonce)
                    .doFinal(Arrays.copyOfRange(stored, 12, stored.length)), StandardCharsets.US_ASCII);
            if (!raw.matches("[A-Za-z0-9_-]{43}") || !MessageDigest.isEqual(
                    hash(raw).getBytes(StandardCharsets.US_ASCII), expectedHash.getBytes(StandardCharsets.US_ASCII))) {
                throw unavailable();
            }
            return raw;
        } catch (GeneralSecurityException | IllegalArgumentException exception) {
            throw unavailable();
        }
    }

    public String hash(String raw) {
        if (raw == null || !raw.matches("[A-Za-z0-9_-]{43}")) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "공유 초대 토큰 형식이 올바르지 않습니다.");
        }
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256을 사용할 수 없습니다.");
        }
    }

    private SecretKeySpec key(String id) {
        if (id == null || !id.matches("[A-Za-z0-9_-]{1,32}")) throw unavailable();
        String encoded = properties.keys().get(id);
        if (encoded == null) throw unavailable();
        try {
            byte[] key = Base64.getDecoder().decode(encoded);
            if (key.length != 32) throw unavailable();
            return new SecretKeySpec(key, "AES");
        } catch (IllegalArgumentException exception) {
            throw unavailable();
        }
    }

    private Cipher cipher(int mode, SecretKeySpec key, String id, byte[] nonce) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, key, new GCMParameterSpec(128, nonce));
        cipher.updateAAD(("invitation-token:v1:" + id).getBytes(StandardCharsets.US_ASCII));
        return cipher;
    }

    private BusinessException unavailable() {
        return new BusinessException(ErrorCode.INVITATION_UNAVAILABLE, "공유 초대 링크를 처리할 수 없습니다.");
    }
}
