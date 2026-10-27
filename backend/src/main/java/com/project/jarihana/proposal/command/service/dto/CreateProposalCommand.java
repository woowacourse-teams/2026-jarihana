package com.project.jarihana.proposal.command.service.dto;

import com.project.jarihana.proposal.domain.ProposalCategory;
import java.util.List;

public record CreateProposalCommand(
        long memberId,
        ProposalCategory category,
        String title,
        String content,
        List<String> moodOptions
) {

    public CreateProposalCommand {
        moodOptions = moodOptions == null ? List.of() : List.copyOf(moodOptions);
    }
}
