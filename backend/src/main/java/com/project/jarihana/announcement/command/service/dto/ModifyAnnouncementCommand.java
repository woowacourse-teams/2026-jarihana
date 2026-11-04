package com.project.jarihana.announcement.command.service.dto;

import com.project.jarihana.announcement.domain.AnnouncementScope;

public record ModifyAnnouncementCommand(String title, String content, AnnouncementScope scope) {
}
