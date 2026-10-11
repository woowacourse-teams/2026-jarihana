package com.project.jarihana.invitation.command.repository;

import com.project.jarihana.invitation.domain.Invitation;
import org.springframework.data.repository.Repository;

import java.util.Optional;
import java.util.UUID;

public interface InvitationCommandRepository extends Repository<Invitation, Long> {
    Invitation save(Invitation invitation);

    Optional<Invitation> findById(long id);

    Optional<Invitation> findByInviterMemberIdAndRequestId(long inviterMemberId, UUID requestId);

    Optional<Invitation> findByTokenHash(String tokenHash);
}
