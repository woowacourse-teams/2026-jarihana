package com.project.jarihana.registration.command.service.dto;

import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.DecisionActorType;
import com.project.jarihana.registration.domain.RegistrationStatus;
import java.time.LocalDateTime;

public record CreateRegistrationResult(
        long id,
        RegistrationStatus status,
        LocalDateTime registeredAt,
        LocalDateTime decidedAt,
        DecisionActorType decidedByType
) {

    public static CreateRegistrationResult from(Registration registration) {
        return new CreateRegistrationResult(
                registration.getId(),
                registration.getStatus(),
                registration.getRegisteredAt(),
                registration.getDecidedAt(),
                registration.getDecidedBy() == null ? null : registration.getDecidedBy().getType()
        );
    }
}
