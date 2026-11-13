package com.project.jarihana.realtime.transport.websocket;

import com.project.jarihana.realtime.room.runtime.RoomRegistry;
import com.project.jarihana.realtime.transport.protocol.Values;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.ObjectMapper;

@Component
public final class RoomSocketHandler extends TextWebSocketHandler {
    private final RoomRegistry rooms;
    private final ObjectMapper mapper;

    public RoomSocketHandler(RoomRegistry rooms, ObjectMapper mapper) {
        this.rooms = rooms;
        this.mapper = mapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) { rooms.open(session); }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        try {
            if (message.getPayloadLength() > 8192) { rooms.malformed(session.getId()); return; }
            rooms.message(session.getId(), Values.object(mapper.readValue(message.getPayload(), Object.class)));
        } catch (RuntimeException error) { rooms.malformed(session.getId()); }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) { rooms.disconnected(session.getId(), status); }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable error) { rooms.malformed(session.getId()); }
}
