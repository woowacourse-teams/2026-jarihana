package com.project.jarihana.chat.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.security.messaging.web.csrf.CsrfChannelInterceptor;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;

@Configuration
@EnableWebSocketMessageBroker
public class ChatWebSocketConfig implements WebSocketMessageBrokerConfigurer {
    private final ChatHandshakeInterceptor handshake;
    private final ChatInboundInterceptor inbound;
    private final ChatSocketSessions sessions;
    private final String[] origins;

    public ChatWebSocketConfig(
            ChatHandshakeInterceptor handshake,
            ChatInboundInterceptor inbound,
            ChatSocketSessions sessions,
            @Value("${chat.allowed-origins:${jarihana.auth.frontend-origin}}") String[] origins) {
        this.handshake = handshake;
        this.inbound = inbound;
        this.sessions = sessions;
        this.origins = origins;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws/chat").addInterceptors(handshake).setAllowedOrigins(origins);
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/queue");
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.taskExecutor().corePoolSize(2).maxPoolSize(4).queueCapacity(256);
        registration.interceptors(inbound, new CsrfChannelInterceptor());
    }

    @Override
    public void configureClientOutboundChannel(ChannelRegistration registration) {
        registration.taskExecutor().corePoolSize(2).maxPoolSize(4).queueCapacity(256);
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        registration
                .setMessageSizeLimit(16384)
                .setSendBufferSizeLimit(262144)
                .setSendTimeLimit(10000)
                .setTimeToFirstMessage(10000)
                .addDecoratorFactory(
                        handler ->
                                new WebSocketHandlerDecorator(handler) {
                                    @Override
                                    public void afterConnectionEstablished(WebSocketSession session)
                                            throws Exception {
                                        sessions.opened(session);
                                        if (session.isOpen())
                                            super.afterConnectionEstablished(
                                                    sessions.observe(session));
                                    }

                                    @Override
                                    public void afterConnectionClosed(
                                            WebSocketSession session, CloseStatus status)
                                            throws Exception {
                                        sessions.closed(session);
                                        super.afterConnectionClosed(session, status);
                                    }
                                });
    }
}
