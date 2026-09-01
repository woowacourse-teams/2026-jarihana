package com.project.jarihana.member.query.controller.dto;

import com.project.jarihana.member.domain.Course;
import com.project.jarihana.common.github.GithubAvatarUrl;
import com.project.jarihana.member.query.service.dto.MemberProfileResult;
import com.project.jarihana.member.query.service.dto.MyProfileResult;

public record MyProfileResponse(boolean signupCompleted, MemberResponse member) {

    public static MyProfileResponse from(MyProfileResult result) {
        if (!result.signupCompleted()) {
            return new MyProfileResponse(false, null);
        }
        return new MyProfileResponse(true, MemberResponse.from(result.member()));
    }

    public record MemberResponse(
            Long id,
            String crewName,
            int generation,
            Course course,
            String avatarUrl
    ) {

        private static MemberResponse from(MemberProfileResult member) {
            return new MemberResponse(
                    member.id(),
                    member.crewName(),
                    member.generation(),
                    member.course(),
                    GithubAvatarUrl.from(member.githubId())
            );
        }
    }
}
