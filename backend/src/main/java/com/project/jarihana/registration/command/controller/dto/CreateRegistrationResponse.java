package com.project.jarihana.registration.command.controller.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.project.jarihana.registration.command.service.dto.CreateRegistrationResult;
import com.project.jarihana.registration.domain.DecisionActorType;
import com.project.jarihana.registration.domain.RegistrationStatus;

import java.time.LocalDateTime;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record CreateRegistrationResponse(
        long id,
        RegistrationStatus status,
        LocalDateTime registeredAt,
        LocalDateTime decidedAt,
        DecisionActorResponse decidedBy
) {

    public static CreateRegistrationResponse from(CreateRegistrationResult result) {
        return new CreateRegistrationResponse(
                result.id(),
                result.status(),
                result.registeredAt(),
                result.decidedAt(),
                result.decidedByType() == null ? null : new DecisionActorResponse(result.decidedByType())
        );
    }

    public record DecisionActorResponse(DecisionActorType type) {
    }
}
