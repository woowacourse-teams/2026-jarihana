package com.project.jarihana.activitypost.command.service.dto;

import java.time.LocalDate;

public record SaveActivityPostCommand(String imageKey, String caption, LocalDate activityDate) {
}
