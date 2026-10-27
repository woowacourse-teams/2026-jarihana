package com.project.jarihana.proposal.query.service.dto;

import com.project.jarihana.proposal.domain.ProposalCategory;

public record ProposalListQuery(ProposalCategory category, String cursor, int size) {
}
