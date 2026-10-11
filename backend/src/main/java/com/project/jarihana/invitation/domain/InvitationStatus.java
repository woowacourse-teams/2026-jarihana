package com.project.jarihana.invitation.domain;

import java.time.LocalDateTime;

public enum InvitationStatus {
    ACTIVE, ACCEPTED, EXPIRED, REVOKED, GROUP_ENDED;

    public static InvitationStatus resolve(InvitationType type, LocalDateTime revokedAt, boolean groupActive,
                                           boolean inviterPresent, LocalDateTime expiresAt, boolean accepted,
                                           LocalDateTime now) {
        if (revokedAt != null) return REVOKED;
        if (!groupActive) return GROUP_ENDED;
        if (!inviterPresent || (expiresAt != null && !now.isBefore(expiresAt))) return EXPIRED;
        if (type == InvitationType.DIRECT && accepted) return ACCEPTED;
        return ACTIVE;
    }
}
