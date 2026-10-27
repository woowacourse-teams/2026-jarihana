package com.project.jarihana.proposal.query.controller.dto;

import com.project.jarihana.proposal.domain.ProposalCategory;
import com.project.jarihana.proposal.domain.ProposalMeetingMode;
import com.project.jarihana.proposal.domain.ProposalTimeSlot;
import com.project.jarihana.proposal.query.service.dto.ProposalDetailResult;
import java.time.LocalDateTime;
import java.util.List;

public record ProposalDetailResponse(
        long id,
        ProposalCategory category,
        String title,
        String content,
        String authorNickname,
        String authorAvatarUrl,
        LocalDateTime createdAt,
        List<String> moodOptions,
        long interestCount,
        long commentCount,
        List<TimeSlotCount> timeSlotCounts,
        List<MeetingModeCount> meetingModeCounts,
        List<Long> moodCounts,
        MyInterest myInterest,
        boolean canDelete
) {

    public static ProposalDetailResponse from(ProposalDetailResult result) {
        return new ProposalDetailResponse(
                result.id(),
                result.category(),
                result.title(),
                result.content(),
                result.authorNickname(),
                result.authorAvatarUrl(),
                result.createdAt(),
                result.moodOptions(),
                result.interestCount(),
                result.commentCount(),
                result.timeSlotCounts().stream()
                        .map(count -> new TimeSlotCount(count.timeSlot(), count.count()))
                        .toList(),
                result.meetingModeCounts().stream()
                        .map(count -> new MeetingModeCount(count.meetingMode(), count.count()))
                        .toList(),
                result.moodCounts(),
                result.myInterest() == null ? null : new MyInterest(
                        result.myInterest().timeSlots(),
                        result.myInterest().meetingModes(),
                        result.myInterest().moodIndexes()
                ),
                result.canDelete()
        );
    }

    public record TimeSlotCount(ProposalTimeSlot timeSlot, long count) {
    }

    public record MeetingModeCount(ProposalMeetingMode meetingMode, long count) {
    }

    public record MyInterest(
            List<ProposalTimeSlot> timeSlots,
            List<ProposalMeetingMode> meetingModes,
            List<Integer> moodIndexes
    ) {
    }
}
