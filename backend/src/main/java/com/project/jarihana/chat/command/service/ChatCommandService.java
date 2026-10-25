package com.project.jarihana.chat.command.service;

import com.project.jarihana.chat.command.repository.ChatCommandRepository;
import com.project.jarihana.chat.command.service.dto.ReadChatResult;
import com.project.jarihana.chat.command.service.dto.SendChatResult;
import com.project.jarihana.chat.domain.ChatLifecycleEvent;
import com.project.jarihana.chat.domain.ChatMessage;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

import io.micrometer.core.instrument.MeterRegistry;

import lombok.RequiredArgsConstructor;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class ChatCommandService {
    private final ChatCommandRepository repository;
    private final Clock clock;
    private final MeterRegistry metrics;

    @Transactional(timeout = 10)
    public SendChatResult sendMessage(long memberId, long groupId, UUID requestId, String content) {
        long started = System.nanoTime();
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCompletion(int status) {
                        metrics.timer(
                                        "chat.message.write",
                                        "outcome",
                                        status == STATUS_COMMITTED ? "committed" : "rolled_back")
                                .record(System.nanoTime() - started, TimeUnit.NANOSECONDS);
                    }
                });
        ChatMessage.validate(requestId, content);
        String status = repository.lockGroup(groupId);
        repository.requireMember(groupId, memberId);
        var existing = repository.findRequest(groupId, memberId, requestId);
        if (existing.isPresent()) {
            if (!existing.orElseThrow().content().equals(content))
                throw new BusinessException(
                        ErrorCode.CONCURRENT_MODIFICATION, "같은 요청 식별자에 다른 메시지를 사용할 수 없습니다.");
            metrics.counter("chat.message.idempotent").increment();
            return new SendChatResult(existing.orElseThrow(), false);
        }
        if (!"ACTIVE".equals(status))
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 모임에는 메시지를 보낼 수 없습니다.");
        ChatMessage message =
                repository.save(groupId, memberId, requestId, content, LocalDateTime.now(clock));
        repository.notifyEvent("MESSAGE_CREATED", groupId, null, message.id());
        return new SendChatResult(message, true);
    }

    @Transactional(timeout = 10)
    public ReadChatResult markRead(long memberId, long groupId, long sequence) {
        repository.lockGroup(groupId);
        repository.requireMember(groupId, memberId);
        long latestSequence = repository.latestSequence(groupId);
        if (sequence < 0 || sequence > latestSequence)
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "읽음 순번은 저장된 메시지 범위여야 합니다.");
        long cursor = repository.advanceRead(groupId, memberId, sequence);
        repository.notifyEvent("READ_STATE_UPDATED", groupId, memberId, null);
        return new ReadChatResult(
                groupId, cursor, latestSequence, repository.unreadCount(groupId, memberId, cursor));
    }

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    public void onLifecycle(ChatLifecycleEvent event) {
        switch (event.type()) {
            case JOINED -> repository.initializeRead(event.groupId(), event.memberId());
            case CLOSED -> repository.notifyEvent("ROOM_CLOSED", event.groupId(), null, null);
            case REMOVED -> repository.notifyRemoval(event.groupId());
        }
    }
}
