package com.project.jarihana.registration.query.controller.dto;

import com.project.jarihana.registration.domain.RegistrationStatus;
import com.project.jarihana.registration.query.service.dto.RegistrationListQuery;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record RegistrationListRequest(
        RegistrationStatus status,
        String cursor,
        @Min(1) @Max(100) Integer size
) {

    public RegistrationListRequest {
        cursor = cursor == null || cursor.isBlank() ? null : cursor;
        size = size == null ? 20 : size;
    }

    public RegistrationListQuery toQuery() {
        return new RegistrationListQuery(status, cursor, size);
    }
}
