package com.project.jarihana.invitation.query.repository.dto;

import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.MemberType;

import java.time.LocalDateTime;

public record InvitationCandidateProjection(long memberId, String crewName, Integer generation,
                                           MemberType memberType, Course course, LocalDateTime createdAt) { }
