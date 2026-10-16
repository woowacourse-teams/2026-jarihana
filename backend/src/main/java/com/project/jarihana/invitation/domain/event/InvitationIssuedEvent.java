package com.project.jarihana.invitation.domain.event;

import java.time.LocalDateTime;

public record InvitationIssuedEvent(long invitationId, long groupId, long targetMemberId, LocalDateTime occurredAt) {
    public InvitationIssuedEvent {
        if (invitationId <= 0 || groupId <= 0 || targetMemberId <= 0 || occurredAt == null) {
            throw new IllegalArgumentException("지정 초대 발급 사건의 식별자와 시각이 필요합니다.");
        }
    }
}
