package com.project.jarihana.member.query.controller.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.project.jarihana.common.github.GithubAvatarUrl;
import com.project.jarihana.member.domain.BootcampStatus;
import com.project.jarihana.member.domain.Career;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.MemberField;
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
            String avatarUrl,
            BootcampResponse bootcamp,
            MemberField field,
            Career career,
            CompanyResponse company
    ) {

        private static MemberResponse from(MemberProfileResult member) {
            return new MemberResponse(
                    member.id(),
                    member.crewName(),
                    member.generation(),
                    member.memberType(),
                    member.course(),
                    GithubAvatarUrl.from(member.githubId()),
                    BootcampResponse.from(member),
                    member.field(),
                    member.career(),
                    CompanyResponse.from(member)
            );
        }
    }

    public record BootcampResponse(String name, BootcampStatus status, String cohort) {

        private static BootcampResponse from(MemberProfileResult member) {
            if (member.bootcampName() == null) {
                return null;
            }
            return new BootcampResponse(member.bootcampName(), member.bootcampStatus(), member.bootcampCohort());
        }
    }

    /**
     * 회사명은 본인 응답에만 담는다. 다른 회원에게 보여 줄지는 {@code visible}이 정한다.
     */
    public record CompanyResponse(String name, boolean visible) {

        private static CompanyResponse from(MemberProfileResult member) {
            if (member.companyName() == null) {
                return null;
            }
            return new CompanyResponse(member.companyName(), Boolean.TRUE.equals(member.companyVisible()));
        }
    }
}
