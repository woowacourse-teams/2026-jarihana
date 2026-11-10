package com.project.jarihana.chat.domain;

import java.time.LocalDateTime;

public record ChatMessageCreatedEvent(long messageId, long groupId, long senderMemberId,
                                      LocalDateTime occurredAt) {
}
