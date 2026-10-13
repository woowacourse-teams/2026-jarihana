package com.project.jarihana.invitation.query.controller.dto;

import com.project.jarihana.invitation.query.service.InvitationListScope;
import com.project.jarihana.invitation.query.service.dto.IssuedInvitationQuery;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record IssuedInvitationRequest(InvitationListScope scope, String cursor, @Min(1) @Max(100) Integer size) {
    public IssuedInvitationRequest {
        scope = scope == null ? InvitationListScope.MINE : scope;
        size = size == null ? 20 : size;
    }

    public IssuedInvitationQuery toQuery() { return new IssuedInvitationQuery(scope, cursor, size); }
}
