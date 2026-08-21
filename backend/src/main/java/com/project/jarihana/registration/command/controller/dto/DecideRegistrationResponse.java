package com.project.jarihana.registration.command.controller.dto;

import com.project.jarihana.registration.command.service.dto.DecideRegistrationResult;
import com.project.jarihana.registration.domain.DecisionActorType;
import com.project.jarihana.registration.domain.RegistrationStatus;
import java.time.LocalDateTime;

public record DecideRegistrationResponse(
        long id,
        RegistrationStatus status,
        String decisionReason,
        LocalDateTime decidedAt,
        DecisionActorResponse decidedBy
) {

    public static DecideRegistrationResponse from(DecideRegistrationResult result) {
        return new DecideRegistrationResponse(
                result.id(),
                result.status(),
                result.decisionReason(),
                result.decidedAt(),
                new DecisionActorResponse(result.decidedByType(), result.decidedByMemberId())
        );
    }

    public record DecisionActorResponse(
            DecisionActorType type,
            long memberId
    ) {
    }
}
