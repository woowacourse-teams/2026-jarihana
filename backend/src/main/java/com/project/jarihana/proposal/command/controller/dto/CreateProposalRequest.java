package com.project.jarihana.proposal.command.controller.dto;

import com.project.jarihana.proposal.command.service.dto.CreateProposalCommand;
import com.project.jarihana.proposal.domain.ProposalCategory;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record CreateProposalRequest(
        @NotNull ProposalCategory category,
        @NotBlank String title,
        @NotBlank String content,
        List<String> moodOptions
) {

    public CreateProposalCommand toCommand(long memberId) {
        return new CreateProposalCommand(memberId, category, title, content, moodOptions);
    }
}
