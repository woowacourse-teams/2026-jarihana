package com.project.jarihana.recruitment.command.service.dto;

import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.recruitment.domain.RecruitmentPhase;

import java.time.LocalDateTime;

public record CreateRecruitmentResult(
        long id,
        long groupId,
        JoinMethod joinMethod,
        int capacity,
        LocalDateTime startsAt,
        LocalDateTime endsAt,
        RecruitmentPhase phase
) {

    public static CreateRecruitmentResult of(GroupRecruitment recruitment, LocalDateTime now) {
        return new CreateRecruitmentResult(
                recruitment.getId(),
                recruitment.getGroup().getId(),
                recruitment.getJoinMethod(),
                recruitment.getCapacity(),
                recruitment.getStartsAt(),
                recruitment.getEndsAt(),
                recruitment.phaseAt(now)
        );
    }
}
