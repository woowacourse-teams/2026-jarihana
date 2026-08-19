package com.project.jarihana.auth.command.service;

import com.project.jarihana.auth.client.GithubOAuthClient;
import com.project.jarihana.auth.command.service.dto.GithubLoginCommand;
import com.project.jarihana.auth.command.service.dto.GithubLoginResult;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Member;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.stereotype.Service;

@Service
public class GithubOAuthCommandService {

    private static final String INVALID_CALLBACK_MESSAGE = "GitHub 로그인 요청이 올바르지 않습니다.";
    private static final String STATE_INVALID_MESSAGE = "GitHub 로그인 요청을 확인하지 못했습니다. 다시 시도해 주세요.";

    private final GithubOAuthClient githubOAuthClient;
    private final MemberRepository memberRepository;
    private final RefreshTokenIssuer refreshTokenIssuer;

    public GithubOAuthCommandService(
            GithubOAuthClient githubOAuthClient,
            MemberRepository memberRepository,
            RefreshTokenIssuer refreshTokenIssuer
    ) {
        this.githubOAuthClient = githubOAuthClient;
        this.memberRepository = memberRepository;
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
        return GithubLoginResult.loggedIn(githubId, refreshTokenIssuer.issue(member));
    }

    private void validateCallback(GithubLoginCommand command) {
        if (isBlank(command.authorizationCode()) || isBlank(command.state())) {
            throw new BusinessException(ErrorCode.OAUTH_INVALID_CALLBACK, INVALID_CALLBACK_MESSAGE);
        }
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

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
