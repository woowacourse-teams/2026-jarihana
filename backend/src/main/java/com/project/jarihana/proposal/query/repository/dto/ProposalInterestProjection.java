package com.project.jarihana.proposal.query.repository.dto;

import com.project.jarihana.proposal.domain.ProposalMeetingMode;
import com.project.jarihana.proposal.domain.ProposalTimeSlot;
import java.util.Set;

public record ProposalInterestProjection(
        Long memberId,
        Set<ProposalTimeSlot> timeSlots,
        Set<ProposalMeetingMode> meetingModes,
        Set<Integer> moodIndexes
) {
}
