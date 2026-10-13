package com.project.jarihana.invitation.query.repository;

import com.project.jarihana.invitation.domain.Invitation;
import com.project.jarihana.invitation.query.repository.dto.ReceivedInvitationProjection;
import com.project.jarihana.invitation.query.repository.dto.InvitationDetailProjection;
import com.project.jarihana.invitation.query.repository.dto.IssuedInvitationProjection;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

public interface InvitationQueryRepository extends Repository<Invitation, Long> {

    @Query("""
            select new com.project.jarihana.invitation.query.repository.dto.InvitationDetailProjection(
                i.id, i.type, g.id, g.name, g.introduction, inviter.id, inviter.crewName, target.id, i.createdAt, i.expiresAt, i.revokedAt, g.status = com.project.jarihana.group.domain.GroupStatus.ACTIVE,
                inviter.withdrawnAt is null and exists (
                    select gm.id from GroupMember gm where gm.group.id = g.id and gm.member.id = inviter.id),
                exists (select a.id from InvitationAcceptance a where a.invitation.id = i.id and a.member.id = target.id),
                exists (select gm.id from GroupMember gm where gm.group.id = g.id and gm.member.id = :viewerId),
                exists (select gm.id from GroupMember gm where gm.group.id = g.id and gm.member.id = :viewerId
                    and gm.role = com.project.jarihana.groupmember.domain.GroupMemberRole.LEADER),
                i.tokenHash, i.encryptedToken, i.state)
            from Invitation i join i.group g join i.inviterMember inviter left join i.targetMember target
            where i.id = :id
            """)
    Optional<InvitationDetailProjection> findDetail(@Param("id") long id, @Param("viewerId") long viewerId);

    @Query("select i.id from Invitation i where i.tokenHash = :hash and i.type = com.project.jarihana.invitation.domain.InvitationType.LINK")
    Optional<Long> findLinkIdByTokenHash(@Param("hash") String hash);

    @Query("""
            select new com.project.jarihana.invitation.query.repository.dto.IssuedInvitationProjection(
                i.id, i.type, g.id, g.name, inviter.id, inviter.crewName, target.id, target.crewName, i.createdAt, i.expiresAt, i.revokedAt, g.status = com.project.jarihana.group.domain.GroupStatus.ACTIVE,
                inviter.withdrawnAt is null and exists (
                    select gm.id from GroupMember gm where gm.group.id = g.id and gm.member.id = inviter.id),
                exists (select a.id from InvitationAcceptance a where a.invitation.id = i.id and a.member.id = target.id), i.state)
            from Invitation i join i.group g join i.inviterMember inviter left join i.targetMember target
            where g.id = :groupId and ((:managed = true and i.type = com.project.jarihana.invitation.domain.InvitationType.LINK)
                or (:managed = false and inviter.id = :memberId and i.type = com.project.jarihana.invitation.domain.InvitationType.DIRECT))
              and (cast(:createdAt as timestamp) is null or i.createdAt < :createdAt or (i.createdAt = :createdAt and i.id < :id))
            order by i.createdAt desc, i.id desc
            """)
    Slice<IssuedInvitationProjection> findIssued(@Param("groupId") long groupId, @Param("memberId") long memberId,
            @Param("managed") boolean managed, @Param("createdAt") LocalDateTime createdAt,
            @Param("id") Long id, Pageable pageable);

    @Query("""
            select new com.project.jarihana.invitation.query.repository.dto.ReceivedInvitationProjection(
                i.id, i.type, g.id, g.name, inviter.id, inviter.crewName, i.createdAt, i.expiresAt, i.revokedAt, g.status = com.project.jarihana.group.domain.GroupStatus.ACTIVE,
                inviter.withdrawnAt is null and exists (
                    select gm.id from GroupMember gm where gm.group.id = g.id and gm.member.id = inviter.id),
                exists (select a.id from InvitationAcceptance a where a.invitation.id = i.id and a.member.id = :memberId), i.state)
            from Invitation i join i.group g join i.inviterMember inviter
            where i.type = com.project.jarihana.invitation.domain.InvitationType.DIRECT and i.targetMember.id = :memberId
              and (cast(:createdAt as timestamp) is null or i.createdAt < :createdAt or (i.createdAt = :createdAt and i.id < :id))
            order by i.createdAt desc, i.id desc
            """)
    Slice<ReceivedInvitationProjection> findReceived(@Param("memberId") long memberId,
            @Param("createdAt") LocalDateTime createdAt, @Param("id") Long id, Pageable pageable);
}
