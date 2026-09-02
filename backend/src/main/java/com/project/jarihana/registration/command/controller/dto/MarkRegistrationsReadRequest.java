package com.project.jarihana.registration.command.controller.dto;

import jakarta.validation.constraints.Positive;

public record MarkRegistrationsReadRequest(
        @Positive(message = "마지막 확인 신청 ID는 양수여야 합니다.") long throughRegistrationId
) {
}
