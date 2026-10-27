package com.project.jarihana.chat.command.repository;

import com.project.jarihana.chat.domain.ChatRoom;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface ChatRoomCommandJpaRepository extends Repository<ChatRoom, Long> {
    Optional<ChatRoom> findById(Long id);

    ChatRoom save(ChatRoom room);

    // FOR UPDATE must also conflict with the membership INSERT's foreign-key lock.
    @Query(value = "select status from groups where id = :groupId for update", nativeQuery = true)
    Optional<String> lockGroupStatus(@Param("groupId") long groupId);

    @Query(
            value =
                    """
                    select cast(pg_notify('jarihana_chat', cast(json_build_object(
                        'version', 1, 'type', cast(:type as text), 'groupId', cast(:groupId as bigint),
                        'memberId', cast(:memberId as bigint), 'messageId', cast(:messageId as bigint)) as text)) as text)
                    """,
            nativeQuery = true)
    String notifyEvent(
            @Param("type") String type,
            @Param("groupId") long groupId,
            @Param("memberId") Long memberId,
            @Param("messageId") Long messageId);
}
