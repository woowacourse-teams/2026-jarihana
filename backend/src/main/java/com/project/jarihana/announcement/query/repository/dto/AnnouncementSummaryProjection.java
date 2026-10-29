package com.project.jarihana.announcement.query.repository.dto;

import com.project.jarihana.announcement.domain.AnnouncementScope;

import java.time.LocalDateTime;

public record AnnouncementSummaryProjection(long id, String title, AnnouncementScope scope,
                                            String authorNickname, LocalDateTime createdAt) {
}
