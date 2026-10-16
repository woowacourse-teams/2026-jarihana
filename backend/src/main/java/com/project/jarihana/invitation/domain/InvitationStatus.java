package com.project.jarihana.invitation.domain;

import java.time.LocalDateTime;

public enum InvitationStatus {
    VALID, ACCEPTED, REJECTED, EXPIRED, CANCELED, GROUP_ENDED;

    public static InvitationStatus resolve(InvitationType type, LocalDateTime revokedAt, boolean groupActive,
                                           boolean inviterPresent, LocalDateTime expiresAt, boolean accepted,
                                           LocalDateTime now, InvitationState state) {
        if (type == InvitationType.DIRECT && state == InvitationState.REJECTED) return REJECTED;
        if (state == InvitationState.CANCELED || revokedAt != null) return CANCELED;
        if (!groupActive) return GROUP_ENDED;
        if (!inviterPresent || (expiresAt != null && !now.isBefore(expiresAt))) return EXPIRED;
        if (type == InvitationType.DIRECT && accepted) return ACCEPTED;
        return VALID;
    }
}
