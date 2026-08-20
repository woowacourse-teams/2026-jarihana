package com.project.jarihana.recruitment.command.controller.dto;

import com.project.jarihana.recruitment.command.service.dto.CreateRecruitmentResult;
import com.project.jarihana.recruitment.domain.RecruitmentPhase;
import java.time.LocalDateTime;

public record CreateRecruitmentResponse(
        long id,
        long groupId,
        String joinMethod,
        int capacity,
        LocalDateTime startsAt,
        LocalDateTime endsAt,
        String recruitingStatus
) {

    public static CreateRecruitmentResponse from(CreateRecruitmentResult result) {
        return new CreateRecruitmentResponse(
                result.id(),
                result.groupId(),
                result.joinMethod().name(),
                result.capacity(),
                result.startsAt(),
                result.endsAt(),
                toRecruitingStatus(result.phase())
        );
    }

    private static String toRecruitingStatus(RecruitmentPhase phase) {
        return switch (phase) {
            case UPCOMING -> "SCHEDULED";
            case OPEN -> "OPEN";
            case ALWAYS_OPEN -> "ALWAYS_OPEN";
            case CLOSED -> "CLOSED";
        };
    }
}
