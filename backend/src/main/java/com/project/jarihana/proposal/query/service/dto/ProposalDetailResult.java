package com.project.jarihana.proposal.query.service.dto;

import com.project.jarihana.proposal.domain.ProposalCategory;
import com.project.jarihana.proposal.domain.ProposalMeetingMode;
import com.project.jarihana.proposal.domain.ProposalTimeSlot;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 조건별 인원은 모든 선택지를 선언 순서대로 담고, 고른 사람이 없으면 0명이다.
 * 분위기 인원은 {@code moodOptions}와 같은 순서다.
 */
public record ProposalDetailResult(
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
