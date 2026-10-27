package com.project.jarihana.proposal.query.controller.dto;

import com.project.jarihana.proposal.query.service.dto.ProposalCommentListResult;
import java.time.LocalDateTime;
import java.util.List;

public record ProposalCommentListResponse(List<Item> items, String nextCursor, boolean hasNext) {

    public static ProposalCommentListResponse from(ProposalCommentListResult result) {
        return new ProposalCommentListResponse(
                result.items().stream().map(Item::from).toList(),
                result.nextCursor(),
                result.hasNext()
        );
    }

    public record Item(
            long id,
            String authorNickname,
            String authorAvatarUrl,
            String content,
            LocalDateTime createdAt,
            boolean canDelete
    ) {

        private static Item from(ProposalCommentListResult.Item item) {
            return new Item(
                    item.id(),
                    item.authorNickname(),
                    item.authorAvatarUrl(),
                    item.content(),
                    item.createdAt(),
                    item.canDelete()
            );
        }
    }
}
