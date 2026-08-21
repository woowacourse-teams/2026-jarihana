package com.project.jarihana.recruitment.command.service.dto;

import com.project.jarihana.recruitment.domain.JoinMethod;
import java.time.LocalDateTime;

public record CreateRecruitmentCommand(
        JoinMethod joinMethod,
        int capacity,
        LocalDateTime startsAt,
        LocalDateTime endsAt
) {
}
