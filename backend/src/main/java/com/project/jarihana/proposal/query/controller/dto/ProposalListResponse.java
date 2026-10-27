package com.project.jarihana.proposal.query.controller.dto;

import com.project.jarihana.proposal.domain.ProposalCategory;
import com.project.jarihana.proposal.query.service.dto.ProposalListResult;
import java.time.LocalDateTime;
import java.util.List;

public record ProposalListResponse(List<Item> items, String nextCursor, boolean hasNext) {

    public static ProposalListResponse from(ProposalListResult result) {
        return new ProposalListResponse(
                result.items().stream().map(Item::from).toList(),
                result.nextCursor(),
                result.hasNext()
        );
    }

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

        private static Item from(ProposalListResult.Item item) {
            return new Item(
                    item.id(),
                    item.category(),
                    item.title(),
                    item.content(),
                    item.authorNickname(),
                    item.authorAvatarUrl(),
                    item.interestCount(),
                    item.commentCount(),
                    item.interested(),
                    item.createdAt()
            );
        }
    }
}
