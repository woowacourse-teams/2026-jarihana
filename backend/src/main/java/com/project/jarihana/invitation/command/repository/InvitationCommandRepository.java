package com.project.jarihana.invitation.command.repository;

import com.project.jarihana.invitation.domain.Invitation;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

public interface InvitationCommandRepository extends Repository<Invitation, Long> {
    Invitation save(Invitation invitation);

    Optional<Invitation> findById(long id);

    Optional<Invitation> findByInviterMemberIdAndRequestId(long inviterMemberId, UUID requestId);

    Optional<Invitation> findByTokenHash(String tokenHash);

    @Modifying
    @Query(value = """
            insert into invitation (group_id, inviter_member_id, target_member_id, type, message, request_id,
                                    token_hash, encrypted_token, expires_at, created_at, updated_at)
            values (:groupId, :inviterId, :targetId, :type, :message, :requestId, :tokenHash, :encryptedToken,
                    :expiresAt, :now, :now)
            on conflict (inviter_member_id, request_id) do nothing
            """, nativeQuery = true)
    int insertIfAbsent(@Param("groupId") long groupId, @Param("inviterId") long inviterId,
            @Param("targetId") Long targetId, @Param("type") String type, @Param("message") String message,
            @Param("requestId") UUID requestId, @Param("tokenHash") String tokenHash,
            @Param("encryptedToken") String encryptedToken, @Param("expiresAt") LocalDateTime expiresAt,
            @Param("now") LocalDateTime now);
}
