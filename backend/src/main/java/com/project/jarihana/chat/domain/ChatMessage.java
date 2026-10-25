package com.project.jarihana.chat.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

import java.time.LocalDateTime;
import java.util.UUID;

public record ChatMessage(
        long id,
        long groupId,
        long sequence,
        long senderId,
        String author,
        UUID clientMessageId,
        String content,
        LocalDateTime createdAt) {
    public static void validate(UUID clientMessageId, String content) {
        if (clientMessageId == null
                || content == null
                || content.isBlank()
                || content.length() > 2000)
            throw new BusinessException(
                    ErrorCode.INVALID_PARAMETER, "메시지는 내용과 요청 식별자가 필요하며 2,000자 이하여야 합니다.");
    }
}
