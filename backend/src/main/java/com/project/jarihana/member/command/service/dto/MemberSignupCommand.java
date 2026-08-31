package com.project.jarihana.member.command.service.dto;

import com.project.jarihana.member.domain.Course;

public record MemberSignupCommand(String githubId, String crewName, Integer generation, Course course) {
}
