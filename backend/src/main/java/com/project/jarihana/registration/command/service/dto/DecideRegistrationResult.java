package com.project.jarihana.registration.command.service.dto;

import com.project.jarihana.registration.domain.DecisionActor;
import com.project.jarihana.registration.domain.DecisionActorType;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.RegistrationStatus;

import java.time.LocalDateTime;

public record DecideRegistrationResult(
        long id,
        RegistrationStatus status,
        String decisionReason,
        LocalDateTime decidedAt,
        DecisionActorType decidedByType,
        long decidedByMemberId
) {

    public static DecideRegistrationResult from(Registration registration) {
        DecisionActor decidedBy = registration.getDecidedBy();
        return new DecideRegistrationResult(
                registration.getId(),
                registration.getStatus(),
                registration.getRejectReason(),
                registration.getDecidedAt(),
                decidedBy.getType(),
                decidedBy.getMemberId()
        );
    }
}
