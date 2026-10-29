package com.project.jarihana.member.query.service.dto;

import com.project.jarihana.member.domain.BootcampStatus;
import com.project.jarihana.member.domain.Career;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.MemberField;
import com.project.jarihana.member.domain.MemberType;

public record MemberProfileResult(
        Long id,
        String crewName,
        Integer generation,
        MemberType memberType,
        Course course,
        String githubId,
        String bootcampName,
        BootcampStatus bootcampStatus,
        String bootcampCohort,
        MemberField field,
        Career career,
        String companyName,
        Boolean companyVisible
) {
}
