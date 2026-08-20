package com.project.jarihana.recruitment.command.controller.dto;

import com.project.jarihana.recruitment.command.service.dto.CloseRecruitmentResult;
import java.time.LocalDateTime;

public record CloseRecruitmentResponse(
        long id,
        LocalDateTime endsAt,
        String recruitingStatus
) {

    public static CloseRecruitmentResponse from(CloseRecruitmentResult result) {
        return new CloseRecruitmentResponse(
                result.id(),
                result.endsAt(),
                result.phase().name()
        );
    }
}
