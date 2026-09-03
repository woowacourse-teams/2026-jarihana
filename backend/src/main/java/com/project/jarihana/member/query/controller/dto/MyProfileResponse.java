package com.project.jarihana.member.query.controller.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.project.jarihana.common.github.GithubAvatarUrl;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.MemberType;
import com.project.jarihana.member.query.service.dto.MemberProfileResult;
import com.project.jarihana.member.query.service.dto.MyProfileResult;

public record MyProfileResponse(
        boolean signupCompleted,
        @JsonInclude(JsonInclude.Include.NON_NULL) String avatarUrl,
        MemberResponse member
) {

    public static MyProfileResponse from(MyProfileResult result) {
        if (!result.signupCompleted()) {
            return new MyProfileResponse(false, GithubAvatarUrl.from(result.signupGithubId()), null);
        }
        return new MyProfileResponse(true, null, MemberResponse.from(result.member()));
    }

    public record MemberResponse(
            Long id,
            String crewName,
            Integer generation,
            MemberType memberType,
            Course course,
            String avatarUrl
    ) {

        private static MemberResponse from(MemberProfileResult member) {
            return new MemberResponse(
                    member.id(),
                    member.crewName(),
                    member.generation(),
                    member.memberType(),
                    member.course(),
                    GithubAvatarUrl.from(member.githubId())
            );
        }
    }
}
