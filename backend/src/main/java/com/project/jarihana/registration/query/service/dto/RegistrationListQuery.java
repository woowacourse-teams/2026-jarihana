package com.project.jarihana.registration.query.service.dto;

import com.project.jarihana.registration.domain.RegistrationStatus;

public record RegistrationListQuery(
        RegistrationStatus status,
        String cursor,
        int size
) {
}
