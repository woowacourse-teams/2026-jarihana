package com.project.jarihana.invitation.query.service.dto;

import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.MemberType;

import java.util.List;

public record InvitationCandidateResult(List<Item> items, String nextCursor, boolean hasNext) {
    public InvitationCandidateResult { items = List.copyOf(items); }
    public record Item(long memberId, String crewName, Integer generation, MemberType memberType, Course course) { }
}
