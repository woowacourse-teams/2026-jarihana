package com.project.jarihana.invitation.query.controller.dto;

import com.project.jarihana.invitation.query.service.dto.ReceivedInvitationQuery;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record ReceivedInvitationRequest(String cursor, @Min(1) @Max(100) Integer size) {
    public ReceivedInvitationRequest { size = size == null ? 20 : size; }
    public ReceivedInvitationQuery toQuery() { return new ReceivedInvitationQuery(cursor, size); }
}
