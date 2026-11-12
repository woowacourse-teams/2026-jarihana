package com.project.jarihana.realtime.config;

import com.project.jarihana.realtime.transport.websocket.RoomSocketHandler;
import java.util.Arrays;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

@Configuration
@EnableWebSocket
public class WebSocketConfiguration implements WebSocketConfigurer {
    private final RoomSocketHandler handler;
    private final RealtimeProperties properties;

    public WebSocketConfiguration(RoomSocketHandler handler, RealtimeProperties properties) {
        this.handler = handler;
        this.properties = properties;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/realtime").setAllowedOrigins(
                Arrays.stream(properties.allowedOrigins().split(",")).map(String::trim).toArray(String[]::new));
    }

    @Bean
    ServletServerContainerFactoryBean webSocketContainer() {
        var container = new ServletServerContainerFactoryBean();
        container.setMaxTextMessageBufferSize(8192);
        container.setMaxBinaryMessageBufferSize(1024);
        container.setAsyncSendTimeout(5000L);
        container.setMaxSessionIdleTimeout(properties.heartbeatTimeoutMs() * 2);
        return container;
    }
}
