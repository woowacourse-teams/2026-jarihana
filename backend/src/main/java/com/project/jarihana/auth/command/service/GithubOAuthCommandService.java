package com.project.jarihana.auth.command.service;

import com.project.jarihana.auth.client.GithubOAuthClient;
import com.project.jarihana.auth.command.service.dto.GithubLoginCommand;
import com.project.jarihana.auth.command.service.dto.GithubLoginResult;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.command.service.CrewVerificationService;
import com.project.jarihana.member.domain.Member;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Service
public class GithubOAuthCommandService {

    private static final Logger log = LoggerFactory.getLogger(GithubOAuthCommandService.class);

    private static final String INVALID_CALLBACK_MESSAGE = "GitHub 로그인 요청이 올바르지 않습니다.";
    private static final String STATE_INVALID_MESSAGE = "GitHub 로그인 요청을 확인하지 못했습니다. 다시 시도해 주세요.";

    private final GithubOAuthClient githubOAuthClient;
    private final MemberRepository memberRepository;
    private final CrewVerificationService crewVerificationService;
    private final AccessTokenProvider accessTokenProvider;
    private final RefreshTokenIssuer refreshTokenIssuer;

    public GithubOAuthCommandService(
            GithubOAuthClient githubOAuthClient,
            MemberRepository memberRepository,
            CrewVerificationService crewVerificationService,
            AccessTokenProvider accessTokenProvider,
            RefreshTokenIssuer refreshTokenIssuer
    ) {
        this.githubOAuthClient = githubOAuthClient;
        this.memberRepository = memberRepository;
        this.crewVerificationService = crewVerificationService;
        this.accessTokenProvider = accessTokenProvider;
        this.refreshTokenIssuer = refreshTokenIssuer;
    }

    public GithubLoginResult login(GithubLoginCommand command) {
        validateCallback(command);
        validateState(command);
        String githubId = githubOAuthClient.getGithubId(command.authorizationCode());
        return memberRepository.findByGithubId(githubId)
                .map(member -> loggedIn(githubId, member))
                .orElseGet(() -> GithubLoginResult.signupRequired(githubId));
    }

    private GithubLoginResult loggedIn(String githubId, Member member) {
        verifyCrew(githubId, member);
        return GithubLoginResult.loggedIn(
                githubId,
                accessTokenProvider.issue(member.getId()),
                refreshTokenIssuer.issue(member)
        );
    }

    /**
     * 크루 인증은 로그인의 부가 작업이다. 동시에 같은 기수, 같은 닉네임으로 크루가 생겨 저장이 막혀도
     * 로그인은 막지 않고 다음 로그인에서 다시 대조한다.
     */
    private void verifyCrew(String githubId, Member member) {
        try {
            crewVerificationService.verifyCrew(githubId);
        } catch (DataIntegrityViolationException exception) {
            // 제약 위반 메시지에 닉네임이 담기므로 예외 메시지는 남기지 않는다.
            log.warn("크루 명단 인증을 건너뛰었습니다. memberId={}, cause={}", member.getId(), exception.getClass().getSimpleName());
        }
    }

    private void validateCallback(GithubLoginCommand command) {
        if (isBlank(command.authorizationCode()) || isBlank(command.state())) {
            throw new BusinessException(ErrorCode.OAUTH_INVALID_CALLBACK, INVALID_CALLBACK_MESSAGE);
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private void validateState(GithubLoginCommand command) {
        if (isBlank(command.issuedState()) || !matches(command.issuedState(), command.state())) {
            throw new BusinessException(ErrorCode.OAUTH_STATE_INVALID, STATE_INVALID_MESSAGE);
        }
    }

    private boolean matches(String issuedState, String state) {
        return MessageDigest.isEqual(
                issuedState.getBytes(StandardCharsets.UTF_8),
                state.getBytes(StandardCharsets.UTF_8)
        );
    }
}
