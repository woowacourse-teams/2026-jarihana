package com.project.jarihana.member.command.service.dto;

import com.project.jarihana.member.domain.BootcampStatus;
import com.project.jarihana.member.domain.Career;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.MemberField;
import com.project.jarihana.member.domain.MemberType;

public record MemberSignupCommand(
        String githubId,
        String crewName,
        Integer generation,
        Course course,
        MemberType memberType,
        BootcampCommand bootcamp,
        MemberField field,
        Career career,
        CompanyCommand company
) {

    public record BootcampCommand(String name, BootcampStatus status, String cohort) {
    }

    public record CompanyCommand(String name, Boolean visible) {
    }
}
