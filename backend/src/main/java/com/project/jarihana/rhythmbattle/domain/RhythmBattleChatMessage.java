package com.project.jarihana.rhythmbattle.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 대전 방의 채팅 한 줄이다. 같은 회원이 같은 clientMessageId로 다시 보내면 새로 만들지 않는다. 방이 닫히면 지운다.
 */
@Getter
@Entity
@Table(name = "rhythm_battle_chat_message")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RhythmBattleChatMessage extends BaseEntity {
    static final int MAX_LENGTH = 300;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private long roomId;
    private long memberId;
    @Column(length = 50)
    private String senderName;
    @Column(length = MAX_LENGTH)
    private String body;
    private UUID clientMessageId;

    private RhythmBattleChatMessage(long roomId, long memberId, String senderName, String body, UUID clientMessageId,
            LocalDateTime now) {
        super(now);
        this.roomId = roomId;
        this.memberId = memberId;
        this.senderName = senderName;
        this.body = body;
        this.clientMessageId = clientMessageId;
    }

    public static RhythmBattleChatMessage of(long roomId, long memberId, String senderName, String body,
            UUID clientMessageId, LocalDateTime now) {
        String trimmed = body == null ? "" : body.strip();
        if (trimmed.isEmpty() || trimmed.length() > MAX_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "채팅은 1자 이상 300자 이하로 보내 주세요.");
        }
        if (clientMessageId == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "메시지 번호가 필요해요.");
        }
        return new RhythmBattleChatMessage(roomId, memberId, senderName, trimmed, clientMessageId, now);
    }

    @Override
    public boolean equals(Object other) {
        return this == other || other instanceof RhythmBattleChatMessage message && id != null
                && id.equals(message.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
