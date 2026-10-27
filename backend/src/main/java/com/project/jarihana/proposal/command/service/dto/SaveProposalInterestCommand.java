package com.project.jarihana.proposal.command.service.dto;

import com.project.jarihana.proposal.domain.ProposalMeetingMode;
import com.project.jarihana.proposal.domain.ProposalTimeSlot;
import java.util.Set;

public record SaveProposalInterestCommand(
        long memberId,
        long proposalId,
        Set<ProposalTimeSlot> timeSlots,
        Set<ProposalMeetingMode> meetingModes,
        Set<Integer> moodIndexes
) {
}
