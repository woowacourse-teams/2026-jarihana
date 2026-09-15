package com.project.jarihana.registration.query.service.dto;

public record RegistrationSummaryResult(
        long unreadCount,
        long pendingCount,
        Long targetRecruitmentId,
        Long latestRegistrationId
) {
}
