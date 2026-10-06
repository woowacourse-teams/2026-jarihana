package com.project.jarihana.registration.domain.event;

import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.RegistrationStatus;

import java.time.LocalDateTime;

public record RegistrationDecidedEvent(long groupId, long recruitmentId, long registrationId, long applicantMemberId,
                                       RegistrationStatus status, SystemReason systemReason, LocalDateTime occurredAt) {

    public enum SystemReason { RERECRUITMENT, GROUP_ENDED }

    public static RegistrationDecidedEvent from(Registration registration) {
        return from(registration, null);
    }

    public static RegistrationDecidedEvent from(Registration registration, SystemReason systemReason) {
        if (registration.getStatus() == RegistrationStatus.PENDING) {
            throw new IllegalStateException("결정된 신청의 사건만 발행할 수 있습니다.");
        }
        return new RegistrationDecidedEvent(registration.getRecruitment().getGroup().getId(),
                registration.getRecruitment().getId(), registration.getId(), registration.getMember().getId(),
                registration.getStatus(), systemReason, registration.getDecidedAt());
    }
}
