package com.project.jarihana.recruitment.command.service.dto;

import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.RecruitmentPhase;
import java.time.LocalDateTime;

public record CloseRecruitmentResult(
        long id,
        LocalDateTime endsAt,
        RecruitmentPhase phase
) {

    public static CloseRecruitmentResult of(GroupRecruitment recruitment, LocalDateTime now) {
        return new CloseRecruitmentResult(
                recruitment.getId(),
                recruitment.getEndsAt(),
                recruitment.phaseAt(now)
        );
    }
}
