package com.project.jarihana.proposal.query.controller.dto;

import com.project.jarihana.proposal.query.service.dto.ProposalCommentListQuery;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record ProposalCommentListRequest(
        String cursor,
        @Min(1) @Max(100) Integer size
) {

    public ProposalCommentListRequest {
        cursor = cursor == null || cursor.isBlank() ? null : cursor;
        size = size == null ? 20 : size;
    }

    public ProposalCommentListQuery toQuery() {
        return new ProposalCommentListQuery(cursor, size);
    }
}
