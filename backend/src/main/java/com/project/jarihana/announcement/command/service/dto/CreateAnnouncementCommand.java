package com.project.jarihana.announcement.command.service.dto;

import com.project.jarihana.announcement.domain.AnnouncementScope;

import java.util.UUID;

public record CreateAnnouncementCommand(String title, String content, AnnouncementScope scope, UUID requestId) {
}
