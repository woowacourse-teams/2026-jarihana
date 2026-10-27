package com.project.jarihana.proposal.query.service.dto;

import java.time.LocalDateTime;
import java.util.List;

public record ProposalCommentListResult(List<Item> items, String nextCursor, boolean hasNext) {

    public record Item(
            long id,
            String authorNickname,
            String authorAvatarUrl,
            String content,
            LocalDateTime createdAt,
            boolean canDelete
    ) {
    }
}
