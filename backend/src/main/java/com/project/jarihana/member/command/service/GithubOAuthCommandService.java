package com.project.jarihana.member.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.client.GithubOAuthClient;
import com.project.jarihana.member.command.service.dto.GithubLoginCommand;
import com.project.jarihana.member.command.service.dto.GithubLoginResult;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.member.repository.MemberRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.stereotype.Service;

@Service
public class GithubOAuthCommandService {

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
            throw new BusinessException(
                    ErrorCode.OAUTH_INVALID_CALLBACK,
                    "OAuth 콜백 파라미터가 올바르지 않습니다."
            );
        }
    }

    private void validateState(GithubLoginCommand command) {
        if (isBlank(command.issuedState()) || !matches(command.issuedState(), command.state())) {
            throw new BusinessException(
                    ErrorCode.OAUTH_STATE_INVALID,
                    "OAuth state가 유효하지 않습니다."
            );
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
