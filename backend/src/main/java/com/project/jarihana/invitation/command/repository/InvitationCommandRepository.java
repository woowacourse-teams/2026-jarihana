package com.project.jarihana.invitation.command.repository;

import com.project.jarihana.invitation.domain.Invitation;
import org.springframework.data.repository.Repository;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

public interface InvitationCommandRepository extends Repository<Invitation, Long> {
    Invitation save(Invitation invitation);

    Optional<Invitation> findById(long id);

    @Lock(LockModeType.OPTIMISTIC)
    Optional<Invitation> findWithOptimisticLockById(long id);

    @Lock(LockModeType.OPTIMISTIC_FORCE_INCREMENT)
    @Query("select i from Invitation i where i.id = :id and i.type = com.project.jarihana.invitation.domain.InvitationType.DIRECT")
    Optional<Invitation> findDirectWithOptimisticLockById(@Param("id") long id);

    Optional<Invitation> findByInviterMemberIdAndRequestId(long inviterMemberId, UUID requestId);

    Optional<Invitation> findByTokenHash(String tokenHash);

    @Query(value = """
            select i.* from invitation i join member inviter on inviter.id = i.inviter_member_id
            where i.group_id = :groupId and i.type = 'LINK' and i.status = 'VALID'
              and i.revoked_at is null and i.expires_at > :now and inviter.withdrawn_at is null
              and exists (select 1 from group_member gm
                          where gm.group_id = i.group_id and gm.member_id = i.inviter_member_id)
            order by i.created_at, i.id limit 1
            """, nativeQuery = true)
    Optional<Invitation> findValidSharedLink(@Param("groupId") long groupId, @Param("now") LocalDateTime now);

    @Query("select i.group.id from Invitation i where i.id = :id")
    Optional<Long> findGroupIdById(@Param("id") long id);

    @Modifying
    @Query(value = """
            insert into invitation (group_id, inviter_member_id, target_member_id, type, request_id,
                                    token_hash, encrypted_token, expires_at, created_at, updated_at, version, status)
            values (:groupId, :inviterId, :targetId, :type, :requestId, :tokenHash, :encryptedToken,
                    :expiresAt, :now, :now, 0, 'VALID')
            on conflict (inviter_member_id, request_id) do nothing
            """, nativeQuery = true)
    int insertIfAbsent(@Param("groupId") long groupId, @Param("inviterId") long inviterId,
            @Param("targetId") Long targetId, @Param("type") String type, @Param("requestId") UUID requestId, @Param("tokenHash") String tokenHash,
            @Param("encryptedToken") String encryptedToken, @Param("expiresAt") LocalDateTime expiresAt,
            @Param("now") LocalDateTime now);
}
