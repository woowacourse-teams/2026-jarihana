package com.project.jarihana.chat.config;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;

@Component
public class ChatInboundInterceptor implements ChannelInterceptor {
    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        var a = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (a == null) throw new AccessDeniedException("인증된 채팅 연결이 필요합니다.");
        StompCommand command = a.getCommand();
        if (command == StompCommand.DISCONNECT) return message;
        if (a.getUser() == null) throw new AccessDeniedException("인증된 채팅 연결이 필요합니다.");
        if (command == null
                || command == StompCommand.CONNECT
                || command == StompCommand.STOMP
                || command == StompCommand.UNSUBSCRIBE) return message;
        if (command == StompCommand.SUBSCRIBE
                && "/user/queue/chat-events".equals(a.getDestination())) return message;
        throw new AccessDeniedException("허용되지 않은 채팅 경로입니다.");
    }
}
