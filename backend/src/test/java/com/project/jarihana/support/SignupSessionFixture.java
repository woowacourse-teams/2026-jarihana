package com.project.jarihana.support;

import org.springframework.session.Session;
import org.springframework.session.SessionRepository;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * 가입 세션 속성 이름을 프로덕션이 아니라 이곳이 소유한다. 검증 편의로 프로덕션
 * {@code SignupSession}에 공개 API를 내는 것보다, 이름이 어긋나면 테스트가 깨지는 편이 낫다.
 */
public class SignupSessionFixture {

    private static final String GITHUB_ID_ATTRIBUTE = "signup.githubId";

    private final SessionRepository<? extends Session> sessionRepository;

    public SignupSessionFixture(SessionRepository<? extends Session> sessionRepository) {
        this.sessionRepository = sessionRepository;
    }

    public String create(String githubId) {
        return store(sessionRepository, githubId);
    }

    private <S extends Session> String store(SessionRepository<S> repository, String githubId) {
        S session = repository.createSession();
        session.setAttribute(GITHUB_ID_ATTRIBUTE, githubId);
        repository.save(session);
        return session.getId();
    }

    public String cookieValue(String sessionId) {
        return Base64.getEncoder().encodeToString(sessionId.getBytes(StandardCharsets.UTF_8));
    }

    public String githubIdOf(String cookieValue) {
        Session session = sessionRepository.findById(decode(cookieValue));
        if (session == null) {
            return null;
        }
        return session.getAttribute(GITHUB_ID_ATTRIBUTE);
    }

    private String decode(String cookieValue) {
        return new String(Base64.getDecoder().decode(cookieValue), StandardCharsets.UTF_8);
    }

    public boolean exists(String sessionId) {
        return sessionRepository.findById(sessionId) != null;
    }
}
