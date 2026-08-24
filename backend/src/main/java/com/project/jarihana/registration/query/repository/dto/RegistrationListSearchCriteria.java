package com.project.jarihana.registration.query.repository.dto;

import com.project.jarihana.registration.domain.RegistrationStatus;

import java.time.LocalDateTime;

public record RegistrationListSearchCriteria(
        Long recruitmentId,
        RegistrationStatus status,
        LocalDateTime cursorRegisteredAt,
        Long cursorId
) {
}
