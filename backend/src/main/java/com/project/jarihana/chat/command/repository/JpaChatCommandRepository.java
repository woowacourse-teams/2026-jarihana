package com.project.jarihana.chat.command.repository;

import com.project.jarihana.chat.domain.ChatMessage;
import com.project.jarihana.chat.domain.ChatReadState;
import com.project.jarihana.chat.domain.ChatRoom;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Member;

import jakarta.persistence.EntityManager;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class JpaChatCommandRepository implements ChatCommandRepository {
    private final ChatRoomCommandJpaRepository rooms;
    private final ChatReadStateCommandJpaRepository readStates;
    private final ChatMessageCommandJpaRepository messages;
    private final ChatMemberCommandJpaRepository members;
    private final EntityManager entityManager;

    @Override
    public String lockGroup(long groupId) {
        return rooms.lockGroupStatus(groupId)
                .orElseThrow(
                        () ->
                                new BusinessException(
                                        ErrorCode.GROUP_ACCESS_DENIED, "모임 채팅에 접근할 수 없습니다."));
    }

    @Override
    public void requireMember(long groupId, long memberId) {
        members.findActiveMember(groupId, memberId)
                .orElseThrow(
                        () ->
                                new BusinessException(
                                        ErrorCode.GROUP_ACCESS_DENIED, "모임 채팅에 접근할 수 없습니다."));
    }

    @Override
    public Optional<ChatMessage> findRequest(long groupId, long memberId, UUID requestId) {
        return messages.findRequest(groupId, memberId, requestId);
    }

    @Override
    public ChatMessage save(
            long groupId, long memberId, UUID requestId, String content, LocalDateTime now) {
        ChatRoom room = rooms.findById(groupId).orElseGet(() -> ChatRoom.create(groupId));
        long sequence = rooms.save(room.nextMessage()).lastSequence();
        ChatMessage message =
                messages.save(
                        ChatMessage.create(
                                groupId,
                                sequence,
                                entityManager.getReference(Member.class, memberId),
                                requestId,
                                content,
                                now));
        // Return the timestamp(6) value stored by PostgreSQL, including its rounding.
        entityManager.refresh(message);
        // Initialize the author while the service transaction is still open.
        message.author();
        return message;
    }

    @Override
    public long latestSequence(long groupId) {
        return rooms.findById(groupId).map(ChatRoom::lastSequence).orElse(0L);
    }

    @Override
    public long advanceRead(long groupId, long memberId, long sequence) {
        // The service holds the group's FOR UPDATE lock before loading this state.
        var id = new ChatReadState.Id(groupId, memberId);
        ChatReadState state = readStates.findById(id).orElseGet(() -> ChatReadState.create(id));
        return readStates.save(state.advanceTo(sequence)).lastReadSequence();
    }

    @Override
    public long unreadCount(long groupId, long memberId, long sequence) {
        return messages.countByGroupIdAndSequenceGreaterThanAndSenderIdNot(
                groupId, sequence, memberId);
    }

    @Override
    public void initializeRead(long groupId, long memberId) {
        readStates.initializeRead(groupId, memberId);
    }

    @Override
    public void notifyEvent(String type, long groupId, Long memberId, Long messageId) {
        rooms.notifyEvent(type, groupId, memberId, messageId);
    }

    @Override
    public void notifyRemoval(long groupId) {
        members.findMemberIds(groupId)
                .forEach(memberId -> notifyEvent("ROOM_REMOVED", groupId, memberId, null));
    }
}
