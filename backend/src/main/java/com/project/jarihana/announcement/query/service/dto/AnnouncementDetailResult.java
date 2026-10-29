package com.project.jarihana.announcement.query.service.dto;

import com.project.jarihana.announcement.domain.AnnouncementScope;

import java.time.LocalDateTime;

public record AnnouncementDetailResult(long id, String title, String content, AnnouncementScope scope,
                                       String authorNickname, LocalDateTime createdAt) {
}
