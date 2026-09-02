package com.project.jarihana.registration.query.repository.dto;

public record RegistrationSummaryProjection(
        long unreadCount,
        long pendingCount,
        Long targetRecruitmentId,
        Long latestRegistrationId
) {
}
