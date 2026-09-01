package com.project.jarihana.registration.query.controller.dto;

import com.project.jarihana.registration.query.service.dto.RegistrationSummaryResult;

public record RegistrationSummaryResponse(long pendingCount, Long targetRecruitmentId) {

    public static RegistrationSummaryResponse from(RegistrationSummaryResult result) {
        return new RegistrationSummaryResponse(result.pendingCount(), result.targetRecruitmentId());
    }
}
