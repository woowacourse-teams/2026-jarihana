package com.project.jarihana.proposal.query.controller.dto;

import com.project.jarihana.proposal.domain.ProposalCategory;
import com.project.jarihana.proposal.query.service.dto.ProposalListQuery;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record ProposalListRequest(
        ProposalCategory category,
        String cursor,
        @Min(1) @Max(100) Integer size
) {

    public ProposalListRequest {
        cursor = cursor == null || cursor.isBlank() ? null : cursor;
        size = size == null ? 20 : size;
    }

    public ProposalListQuery toQuery() {
        return new ProposalListQuery(category, cursor, size);
    }
}
