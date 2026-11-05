package com.project.jarihana.gomoku.domain;

import com.project.jarihana.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "gomoku_chat_message")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GomokuChatMessage extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private long roomId;
    private long sequence;
    private long senderId;
    private UUID participationId;
    private UUID clientMessageId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private GomokuSenderRole senderRole;
    @Column(nullable = false, length = 50)
    private String author;
    @Column(nullable = false, columnDefinition = "text")
    private String content;

    private GomokuChatMessage(long roomId, long sequence, long senderId, UUID participationId,
            UUID clientMessageId, String author, String content, GomokuSenderRole senderRole, LocalDateTime now) {
        super(now);
        this.roomId = roomId;
        this.sequence = sequence;
        this.senderId = senderId;
        this.participationId = participationId;
        this.clientMessageId = clientMessageId;
        this.author = author;
        this.content = content;
        this.senderRole = senderRole;
    }

    public static GomokuChatMessage create(long roomId, long sequence, long senderId,
            UUID participationId, UUID clientMessageId, String author, String content, LocalDateTime now) {
        return create(roomId, sequence, senderId, participationId, clientMessageId, author, content, GomokuSenderRole.PARTICIPANT, now);
    }

    public static GomokuChatMessage create(long roomId, long sequence, long senderId,
            UUID participationId, UUID clientMessageId, String author, String content, GomokuSenderRole senderRole, LocalDateTime now) {
        return new GomokuChatMessage(roomId, sequence, senderId, participationId, clientMessageId, author, content, senderRole, now);
    }
}
