package com.project.jarihana.invitation.command.repository;

import com.project.jarihana.invitation.domain.InvitationAcceptance;
import org.springframework.data.repository.Repository;

import java.util.Optional;

public interface InvitationAcceptanceCommandRepository extends Repository<InvitationAcceptance, Long> {
    InvitationAcceptance save(InvitationAcceptance acceptance);

    Optional<InvitationAcceptance> findByInvitationIdAndMemberId(long invitationId, long memberId);
}
