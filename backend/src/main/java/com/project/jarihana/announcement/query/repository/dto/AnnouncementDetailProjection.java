package com.project.jarihana.announcement.query.repository.dto;

import com.project.jarihana.announcement.domain.AnnouncementScope;

import java.time.LocalDateTime;

public record AnnouncementDetailProjection(long id, String title, String content, AnnouncementScope scope,
                                           String authorNickname, LocalDateTime createdAt) {
}
