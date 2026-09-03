package com.project.jarihana.auth.session;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Access Token은 회원에게만 발급되므로, GitHub 인증만 끝내고 아직 가입하지 않은 사용자에게는
 * 이 세션이 유일한 자격 증명이다.
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
}
