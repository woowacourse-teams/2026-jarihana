package com.project.jarihana.member.query.service.dto;

public record MyProfileResult(boolean signupCompleted, MemberProfileResult member) {

    public static MyProfileResult signupRequired() {
        return new MyProfileResult(false, null);
    }

    public static MyProfileResult signupCompleted(MemberProfileResult member) {
        return new MyProfileResult(true, member);
    }
}
