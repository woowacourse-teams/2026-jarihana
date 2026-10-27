package com.project.jarihana.proposal.query.repository.dto;

import com.project.jarihana.proposal.domain.ProposalCategory;
import java.time.LocalDateTime;
import java.util.List;

public record ProposalDetailProjection(
        Long id,
        ProposalCategory category,
        String title,
        String content,
        List<String> moodOptions,
        String authorNickname,
        String authorGithubId,
        LocalDateTime createdAt,
        long commentCount,
        boolean writtenByViewer
) {
}
