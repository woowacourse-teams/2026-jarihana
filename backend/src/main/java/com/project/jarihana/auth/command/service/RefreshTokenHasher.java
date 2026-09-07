package com.project.jarihana.auth.command.service;

import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * 저장소에는 해시만 남기므로 유출되어도 원문을 복원할 수 없다.
 */
@Component
public class RefreshTokenHasher {

    private static final String HASH_ALGORITHM = "SHA-256";

    public String hash(String tokenValue) {
        try {
            MessageDigest messageDigest = MessageDigest.getInstance(HASH_ALGORITHM);
            byte[] hashed = messageDigest.digest(tokenValue.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashed);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Refresh Token 해시 알고리즘을 사용할 수 없습니다.", exception);
        }
    }
}
