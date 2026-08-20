package com.project.jarihana.registration.query.repository.dto;

import com.project.jarihana.member.domain.Course;
import com.project.jarihana.registration.domain.DecisionActorType;
import com.project.jarihana.registration.domain.RegistrationStatus;
import java.time.LocalDateTime;

public record RegistrationListProjection(
        Long id,
        Long memberId,
        String crewName,
        int generation,
        Course course,
        String message,
        RegistrationStatus status,
        LocalDateTime registeredAt,
        String decisionReason,
        LocalDateTime decidedAt,
        DecisionActorType decidedByType,
        Long decidedByMemberId
) {
}
