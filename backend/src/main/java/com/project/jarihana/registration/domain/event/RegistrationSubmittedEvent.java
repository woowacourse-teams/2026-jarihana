package com.project.jarihana.registration.domain.event;

import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.RegistrationStatus;

import java.time.LocalDateTime;

public record RegistrationSubmittedEvent(long groupId, long recruitmentId, long registrationId,
                                         long leaderMemberId, boolean automaticallyApproved, LocalDateTime occurredAt) {

    public static RegistrationSubmittedEvent from(Registration registration, long leaderMemberId) {
        return new RegistrationSubmittedEvent(registration.getRecruitment().getGroup().getId(),
                registration.getRecruitment().getId(), registration.getId(), leaderMemberId,
                registration.getStatus() == RegistrationStatus.APPROVED, registration.getRegisteredAt());
    }
}
