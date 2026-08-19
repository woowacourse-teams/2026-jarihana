package com.project.jarihana.auth.command.service.dto;

public record GithubLoginResult(boolean signupRequired, String githubId, IssuedRefreshToken refreshToken) {

    public static GithubLoginResult signupRequired(String githubId) {
        return new GithubLoginResult(true, githubId, null);
    }

    public static GithubLoginResult loggedIn(String githubId, IssuedRefreshToken refreshToken) {
        return new GithubLoginResult(false, githubId, refreshToken);
    }
}
