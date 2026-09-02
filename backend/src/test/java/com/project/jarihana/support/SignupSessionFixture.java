package com.project.jarihana.support;

import org.springframework.session.Session;
import org.springframework.session.SessionRepository;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * 인수 테스트가 OAuth 콜백을 거치지 않고 가입 구간을 만든다.
 *
 * <p>가입 세션 속성 이름을 프로덕션이 아니라 이곳이 소유한다. 프로덕션이 이름을 바꾸면 이 상수와
 * 어긋나 저장한 값을 읽지 못하므로, 그 자리에서 테스트가 깨진다. 검증 편의를 위해 프로덕션
 * {@code SignupSession}에 공개 API를 내는 것보다 낫다.
 */
public class SignupSessionFixture {

    private static final String GITHUB_ID_ATTRIBUTE = "signup.githubId";

    private final SessionRepository<? extends Session> sessionRepository;

    public SignupSessionFixture(SessionRepository<? extends Session> sessionRepository) {
        this.sessionRepository = sessionRepository;
    }

    /**
     * 가입 세션을 만들고 세션 식별자를 준다.
     */
    public String create(String githubId) {
        return store(sessionRepository, githubId);
    }

    private <S extends Session> String store(SessionRepository<S> repository, String githubId) {
        S session = repository.createSession();
        session.setAttribute(GITHUB_ID_ATTRIBUTE, githubId);
        repository.save(session);
        return session.getId();
    }

    /**
     * 세션 식별자를 SESSION 쿠키에 실을 수 있는 형태로 바꾼다.
     */
    public String cookieValue(String sessionId) {
        return Base64.getEncoder().encodeToString(sessionId.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * SESSION 쿠키 값이 가리키는 세션에 남은 githubId를 읽는다. 세션이 없으면 {@code null}이다.
     */
    public String githubIdOf(String cookieValue) {
        Session session = sessionRepository.findById(decode(cookieValue));
        if (session == null) {
            return null;
        }
        return session.getAttribute(GITHUB_ID_ATTRIBUTE);
    }

    public boolean exists(String sessionId) {
        return sessionRepository.findById(sessionId) != null;
    }

    private String decode(String cookieValue) {
        return new String(Base64.getDecoder().decode(cookieValue), StandardCharsets.UTF_8);
    }
}
