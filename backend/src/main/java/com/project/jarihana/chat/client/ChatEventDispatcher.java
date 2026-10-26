package com.project.jarihana.chat.client;

import com.project.jarihana.chat.command.controller.dto.ChatMessageResponse;
import com.project.jarihana.chat.query.repository.ChatQueryRepository;
import com.project.jarihana.chat.query.service.dto.ChatMessageResult;
import com.project.jarihana.common.exception.BusinessException;

import io.micrometer.core.instrument.MeterRegistry;

import lombok.RequiredArgsConstructor;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.user.SimpUserRegistry;
import org.springframework.stereotype.Component;

import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class ChatEventDispatcher {
    private final ChatQueryRepository repository;
    private final SimpUserRegistry registry;
    private final SimpMessagingTemplate template;
    private final ObjectMapper mapper;
    private final MeterRegistry metrics;

    public void dispatch(String payload) {
        var notification = mapper.readTree(payload);
        if (notification.path("version").asInt() != 1) return;
        String type = notification.path("type").asText();
        long groupId = notification.path("groupId").asLong();
        var event = new LinkedHashMap<String, Object>();
        event.put("version", 1);
        event.put("type", type);
        event.put("groupId", Long.toString(groupId));
        if ("ROOM_REMOVED".equals(type)) {
            send(notification.path("memberId").asLong(), event);
            return;
        }
        if ("READ_STATE_UPDATED".equals(type)) {
            long memberId = notification.path("memberId").asLong();
            if (registry.getUser(Long.toString(memberId)) == null) return;
            try {
                var room = repository.getRoom(memberId, groupId);
                event.put("lastReadSequence", Long.toString(room.lastReadSequence()));
                event.put("latestSequence", Long.toString(room.latestSequence()));
                event.put("unreadCount", room.unreadCount());
                send(memberId, event);
            } catch (BusinessException removedMembership) {
                metrics.counter("chat.fanout.skipped").increment();
            }
            return;
        }
        if ("MESSAGE_CREATED".equals(type)) {
            var message = repository.findMessage(notification.path("messageId").asLong());
            if (message == null) return;
            event.put("message", ChatMessageResponse.from(ChatMessageResult.from(message)));
        } else if (!"ROOM_CLOSED".equals(type)) return;
        var members = repository.members(groupId);
        metrics.counter("chat.fanout.members").increment(members.size());
        members.forEach(memberId -> send(memberId, event));
    }

    private void send(long memberId, Map<String, Object> event) {
        if (registry.getUser(Long.toString(memberId)) == null) {
            metrics.counter("chat.fanout.skipped").increment();
            return;
        }
        template.setSendTimeout(100);
        template.convertAndSendToUser(Long.toString(memberId), "/queue/chat-events", event);
        metrics.counter("chat.fanout.published").increment();
    }

    public void resync() {
        registry.getUsers()
                .forEach(
                        user ->
                                send(
                                        Long.parseLong(user.getName()),
                                        Map.of("version", 1, "type", "RESYNC_REQUIRED")));
    }
}
