package com.project.jarihana.member.query.service.dto;

public record MyProfileResult(
        boolean signupCompleted,
        String signupGithubId,
        MemberProfileResult member
) {

    public static MyProfileResult signupRequired(String signupGithubId) {
        return new MyProfileResult(false, signupGithubId, null);
    }

    public static MyProfileResult signupCompleted(MemberProfileResult member) {
        return new MyProfileResult(true, null, member);
    }
}
