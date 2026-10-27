package com.project.jarihana.proposal.query.service.dto;

import com.project.jarihana.proposal.domain.ProposalCategory;
import java.time.LocalDateTime;
import java.util.List;

public record ProposalListResult(List<Item> items, String nextCursor, boolean hasNext) {

    public record Item(
            long id,
            ProposalCategory category,
            String title,
            String content,
            String authorNickname,
            String authorAvatarUrl,
            long interestCount,
            long commentCount,
            boolean interested,
            LocalDateTime createdAt
    ) {
    }
}
