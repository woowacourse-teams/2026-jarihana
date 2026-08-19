package com.project.jarihana.auth.client;

public interface GithubOAuthClient {

    String getGithubId(String authorizationCode);
}
