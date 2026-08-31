package com.project.jarihana.member.command.controller.dto;

import com.project.jarihana.member.command.service.dto.MemberSignupResult;
import com.project.jarihana.member.domain.Course;

import java.time.LocalDateTime;

public record MemberSignupResponse(
        Long id,
        String crewName,
        Integer generation,
        Course course,
        LocalDateTime joinedAt
) {

    public static MemberSignupResponse from(MemberSignupResult result) {
        return new MemberSignupResponse(
                result.id(),
                result.crewName(),
                result.generation(),
                result.course(),
                result.joinedAt()
        );
    }
}
