package com.project.jarihana.support;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.client.GithubOAuthClient;

public class GithubOAuthClientStub implements GithubOAuthClient {

    private String githubId = "1";
    private boolean failing;

    public void willReturn(String githubId) {
        this.githubId = githubId;
        this.failing = false;
    }

    public void willFail() {
        this.failing = true;
    }

    @Override
    public String getGithubId(String authorizationCode) {
        if (failing) {
            throw new BusinessException(
                    ErrorCode.OAUTH_PROVIDER_ERROR,
                    "OAuth 제공자 요청에 실패했습니다."
            );
        }
        return githubId;
    }
}
