package com.project.jarihana.chat.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Member;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.experimental.Accessors;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "chat_message")
@Getter
@Accessors(fluent = true)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatMessage {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "group_id", nullable = false, updatable = false)
    private long groupId;

    @Column(nullable = false, updatable = false)
    private long sequence;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_id", nullable = false, updatable = false)
    private Member sender;

    @Column(name = "client_message_id", nullable = false, updatable = false)
    private UUID clientMessageId;

    @Column(nullable = false, updatable = false, columnDefinition = "text")
    private String content;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    private ChatMessage(
            long groupId,
            long sequence,
            Member sender,
            UUID clientMessageId,
            String content,
            LocalDateTime createdAt) {
        this.groupId = groupId;
        this.sequence = sequence;
        this.sender = sender;
        this.clientMessageId = clientMessageId;
        this.content = content;
        this.createdAt = createdAt;
    }

    public static ChatMessage create(
            long groupId,
            long sequence,
            Member sender,
            UUID clientMessageId,
            String content,
            LocalDateTime createdAt) {
        return new ChatMessage(groupId, sequence, sender, clientMessageId, content, createdAt);
    }

    public long senderId() {
        return sender.getId();
    }

    public String author() {
        return sender.getCrewName();
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) return true;
        if (!(other instanceof ChatMessage message)) return false;
        return id != null && id.equals(message.id);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    public static void validate(UUID clientMessageId, String content) {
        if (clientMessageId == null
                || content == null
                || content.isBlank()
                || content.length() > 2000)
            throw new BusinessException(
                    ErrorCode.INVALID_PARAMETER, "메시지는 내용과 요청 식별자가 필요하며 2,000자 이하여야 합니다.");
    }
}
