package com.project.jarihana.chat.command.repository;

import com.project.jarihana.chat.domain.ChatReadState;

import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface ChatReadStateCommandJpaRepository
        extends Repository<ChatReadState, ChatReadState.Id> {
    Optional<ChatReadState> findById(ChatReadState.Id id);

    ChatReadState save(ChatReadState state);

    @Modifying(flushAutomatically = true)
    @Query(
            value =
                    """
                    insert into chat_read_state(group_id, member_id, last_read_sequence)
                    values (:groupId, :memberId,
                        coalesce((select last_sequence from chat_room where group_id = :groupId), 0))
                    on conflict do nothing
                    """,
            nativeQuery = true)
    void initializeRead(@Param("groupId") long groupId, @Param("memberId") long memberId);
}
