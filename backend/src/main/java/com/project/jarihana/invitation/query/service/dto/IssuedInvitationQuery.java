package com.project.jarihana.invitation.query.service.dto;

import com.project.jarihana.invitation.query.service.InvitationListScope;

public record IssuedInvitationQuery(InvitationListScope scope, String cursor, int size) { }
