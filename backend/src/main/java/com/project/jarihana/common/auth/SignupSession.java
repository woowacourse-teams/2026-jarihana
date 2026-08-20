package com.project.jarihana.common.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * GitHub 인증은 끝났지만 아직 회원이 아닌 사용자의 자격 증명을 다룬다.
 *
 * <p>OAuth 콜백이 {@code githubId}를 남기고, 내 정보 조회와 가입 완료가 읽는다. 가입을 마치면
 * 무효화한다. Access Token은 회원에게만 발급되므로 가입 구간에서는 이 세션이 유일한 자격 증명이다.
 */
@Component
public class SignupSession {

    private static final String GITHUB_ID_ATTRIBUTE = "signup.githubId";

    public void store(HttpServletRequest request, String githubId) {
        request.getSession(true).setAttribute(GITHUB_ID_ATTRIBUTE, githubId);
    }

    public Optional<String> githubId(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return Optional.empty();
        }
        Object githubId = session.getAttribute(GITHUB_ID_ATTRIBUTE);
        if (githubId == null) {
            return Optional.empty();
        }
        return Optional.of(String.valueOf(githubId));
    }

    public void invalidate(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
    }

    /**
     * 인수 테스트가 콜백을 거치지 않고 가입 구간을 만들 때 쓰는 세션 속성 이름이다.
     */
    public static String githubIdAttribute() {
        return GITHUB_ID_ATTRIBUTE;
    }
}
