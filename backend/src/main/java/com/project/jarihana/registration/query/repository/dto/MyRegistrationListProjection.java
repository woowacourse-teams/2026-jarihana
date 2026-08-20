package com.project.jarihana.registration.query.repository.dto;

import com.project.jarihana.registration.domain.DecisionActorType;
import com.project.jarihana.registration.domain.RegistrationStatus;
import java.time.LocalDateTime;

public record MyRegistrationListProjection(
        Long id,
        Long groupId,
        String groupName,
        Long recruitmentId,
        String message,
        RegistrationStatus status,
        LocalDateTime registeredAt,
        String decisionReason,
        LocalDateTime decidedAt,
        DecisionActorType decidedByType,
        Long decidedByMemberId
) {
}
