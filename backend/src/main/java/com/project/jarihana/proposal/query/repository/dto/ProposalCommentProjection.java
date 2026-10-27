package com.project.jarihana.proposal.query.repository.dto;

import java.time.LocalDateTime;

public record ProposalCommentProjection(
        Long id,
        String authorNickname,
        String authorGithubId,
        String content,
        LocalDateTime createdAt,
        boolean canDelete
) {
}
