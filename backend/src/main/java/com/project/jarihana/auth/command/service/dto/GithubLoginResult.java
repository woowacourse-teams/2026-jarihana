package com.project.jarihana.auth.command.service.dto;

import com.project.jarihana.auth.token.IssuedAccessToken;
import com.project.jarihana.auth.token.IssuedRefreshToken;

public record GithubLoginResult(
        boolean signupRequired,
        String githubId,
        IssuedAccessToken accessToken,
        IssuedRefreshToken refreshToken
) {

    public static GithubLoginResult signupRequired(String githubId) {
        return new GithubLoginResult(true, githubId, null, null);
    }

    public static GithubLoginResult loggedIn(
            String githubId,
            IssuedAccessToken accessToken,
            IssuedRefreshToken refreshToken
    ) {
        return new GithubLoginResult(false, githubId, accessToken, refreshToken);
    }
}
