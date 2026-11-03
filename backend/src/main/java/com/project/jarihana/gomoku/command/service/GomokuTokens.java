package com.project.jarihana.gomoku.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

@Component
public class GomokuTokens {
    private final SecureRandom random = new SecureRandom();

    public String issue() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public String hash(String raw) {
        if (raw == null || !raw.matches("[A-Za-z0-9_-]{43}")) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "초대 링크가 올바르지 않아요.");
        }
        try {
            return HexFormat.of()
                    .formatHex(
                            MessageDigest.getInstance("SHA-256")
                                    .digest(raw.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    public boolean matches(String raw, String expectedHash) {
        if (raw == null || expectedHash == null) return false;
        return MessageDigest.isEqual(
                hash(raw).getBytes(StandardCharsets.US_ASCII),
                expectedHash.getBytes(StandardCharsets.US_ASCII));
    }
}
