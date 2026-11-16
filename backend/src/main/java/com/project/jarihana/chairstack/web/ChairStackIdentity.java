package com.project.jarihana.chairstack.web;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.chairstack.domain.ChairStackOwner;
import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ChairStackIdentity {

    public static final String COOKIE = "chairStackGuest";
    public static final String PATH = "/games/chair-stack";
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9_-]{43}");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final LoginMemberReader members;
    private final AuthCookieProperties cookies;

    public ChairStackOwner resolve(String token) {
        Long memberId = members.currentMemberId().orElse(null);
        String digest = memberId == null && token != null && TOKEN.matcher(token).matches()
                ? digest(token) : null;
        return new ChairStackOwner(memberId, digest);
    }

    public ChairStackOwner resolveForMutation(String token, boolean member) {
        var owner = resolve(token);
        if (member && owner.guest()) {
            throw new BusinessException(ErrorCode.UNAUTHENTICATED, "회원 세션을 다시 확인해 주세요.");
        }
        if (!member && !owner.guest()) {
            throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION, "플레이어가 변경됐어요.");
        }
        return owner;
    }

    public ResponseCookie newGuestCookie(String contextPath) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return ResponseCookie.from(COOKIE, Base64.getUrlEncoder().withoutPadding().encodeToString(bytes))
                .httpOnly(true)
                .secure(cookies.secure())
                .sameSite("Lax")
                .path(contextPath + PATH)
                .maxAge(Duration.ofDays(365))
                .build();
    }

    private static String digest(String token) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
