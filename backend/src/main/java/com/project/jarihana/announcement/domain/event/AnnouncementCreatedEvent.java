package com.project.jarihana.announcement.domain.event;

import java.time.LocalDateTime;

public record AnnouncementCreatedEvent(long announcementId, long groupId, long authorMemberId,
                                      LocalDateTime occurredAt) {
}
