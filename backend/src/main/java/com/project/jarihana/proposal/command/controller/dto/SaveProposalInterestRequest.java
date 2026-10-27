package com.project.jarihana.proposal.command.controller.dto;

import com.project.jarihana.proposal.command.service.dto.SaveProposalInterestCommand;
import com.project.jarihana.proposal.domain.ProposalMeetingMode;
import com.project.jarihana.proposal.domain.ProposalTimeSlot;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 조건은 모두 생략할 수 있다. 목록에서 마음만 보낼 때는 빈 객체를 보낸다.
 */
public record SaveProposalInterestRequest(
        List<ProposalTimeSlot> timeSlots,
        List<ProposalMeetingMode> meetingModes,
        List<Integer> moodIndexes
) {

    public SaveProposalInterestCommand toCommand(long memberId, long proposalId) {
        return new SaveProposalInterestCommand(
                memberId,
                proposalId,
                toSet(timeSlots),
                toSet(meetingModes),
                toSet(moodIndexes)
        );
    }

    private static <T> Set<T> toSet(List<T> values) {
        return values == null ? Set.of() : new HashSet<>(values);
    }
}
