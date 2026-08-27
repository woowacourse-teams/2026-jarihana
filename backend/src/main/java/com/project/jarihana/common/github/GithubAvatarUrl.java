package com.project.jarihana.common.github;

public final class GithubAvatarUrl {

    private static final String PREFIX = "https://avatars.githubusercontent.com/u/";

    private GithubAvatarUrl() {
    }

    public static String from(String githubId) {
        return PREFIX + githubId;
    }
}
