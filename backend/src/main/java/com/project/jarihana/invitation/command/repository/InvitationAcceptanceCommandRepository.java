package com.project.jarihana.invitation.command.repository;

import com.project.jarihana.invitation.domain.InvitationAcceptance;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface InvitationAcceptanceCommandRepository extends Repository<InvitationAcceptance, Long> {
    InvitationAcceptance save(InvitationAcceptance acceptance);

    Optional<InvitationAcceptance> findByInvitationIdAndMemberId(long invitationId, long memberId);

    @Modifying
    @Query("delete from InvitationAcceptance acceptance where acceptance.invitation.group.id = :groupId")
    void removeAllByGroupId(@Param("groupId") long groupId);
}
