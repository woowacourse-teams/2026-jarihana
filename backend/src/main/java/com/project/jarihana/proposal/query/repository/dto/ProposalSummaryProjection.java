package com.project.jarihana.proposal.query.repository.dto;

import com.project.jarihana.proposal.domain.ProposalCategory;
import java.time.LocalDateTime;

public record ProposalSummaryProjection(
        Long id,
        ProposalCategory category,
        String title,
        String content,
        String authorNickname,
        String authorGithubId,
        long interestCount,
        long commentCount,
        boolean interested,
        LocalDateTime createdAt
) {
}
