package com.project.jarihana.registration.query.controller.dto;

import com.project.jarihana.registration.query.service.dto.RegistrationSummaryResult;

public record RegistrationSummaryResponse(
        long unreadCount,
        long pendingCount,
        Long targetRecruitmentId,
        Long latestRegistrationId
) {

    public static RegistrationSummaryResponse from(RegistrationSummaryResult result) {
        return new RegistrationSummaryResponse(
                result.unreadCount(),
                result.pendingCount(),
                result.targetRecruitmentId(),
                result.latestRegistrationId()
        );
    }
}
