package com.project.jarihana.invitation.query.controller.dto;

import com.project.jarihana.invitation.query.service.dto.InvitationCandidateQuery;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record InvitationCandidateRequest(@NotNull @Size(min = 2, max = 50) String keyword, String cursor,
                                         @Min(1) @Max(100) Integer size) {
    public InvitationCandidateRequest {
        keyword = keyword == null ? null : keyword.strip();
        size = size == null ? 20 : size;
    }
    public InvitationCandidateQuery toQuery() { return new InvitationCandidateQuery(keyword, cursor, size); }
}
