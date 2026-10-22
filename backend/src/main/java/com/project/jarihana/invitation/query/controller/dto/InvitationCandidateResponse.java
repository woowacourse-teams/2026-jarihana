package com.project.jarihana.invitation.query.controller.dto;

import com.project.jarihana.invitation.query.service.dto.InvitationCandidateResult;

import java.util.List;

public record InvitationCandidateResponse(List<ItemResponse> items, String nextCursor, boolean hasNext) {
    public InvitationCandidateResponse { items = List.copyOf(items); }
    public record ItemResponse(long memberId, String crewName, String avatarUrl, Integer generation, String memberType, String course) { }
    public static InvitationCandidateResponse from(InvitationCandidateResult result) {
        return new InvitationCandidateResponse(result.items().stream().map(item -> new ItemResponse(item.memberId(),
                item.crewName(), item.avatarUrl(), item.generation(), item.memberType().name(), item.course() == null ? null : item.course().name()))
                .toList(), result.nextCursor(), result.hasNext());
    }
}
