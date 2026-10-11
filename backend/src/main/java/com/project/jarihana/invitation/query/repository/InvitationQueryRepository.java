package com.project.jarihana.invitation.query.repository;

import com.project.jarihana.invitation.domain.Invitation;
import com.project.jarihana.invitation.query.repository.dto.ReceivedInvitationProjection;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

public interface InvitationQueryRepository extends Repository<Invitation, Long> {

    @Query("""
            select new com.project.jarihana.invitation.query.repository.dto.ReceivedInvitationProjection(
                i.id, i.type, g.id, g.name, inviter.id, inviter.crewName, i.message,
                i.createdAt, i.expiresAt, i.revokedAt, g.status = com.project.jarihana.group.domain.GroupStatus.ACTIVE,
                inviter.withdrawnAt is null and exists (
                    select gm.id from GroupMember gm where gm.group.id = g.id and gm.member.id = inviter.id),
                exists (select a.id from InvitationAcceptance a where a.invitation.id = i.id and a.member.id = :memberId))
            from Invitation i join i.group g join i.inviterMember inviter
            where i.type = com.project.jarihana.invitation.domain.InvitationType.DIRECT and i.targetMember.id = :memberId
              and (cast(:createdAt as timestamp) is null or i.createdAt < :createdAt or (i.createdAt = :createdAt and i.id < :id))
            order by i.createdAt desc, i.id desc
            """)
    Slice<ReceivedInvitationProjection> findReceived(@Param("memberId") long memberId,
            @Param("createdAt") LocalDateTime createdAt, @Param("id") Long id, Pageable pageable);
}
