package com.project.jarihana.activitypost.query.repository.dto;

import java.time.LocalDateTime;

public record ActivityPostCommentProjection(
        Long id,
        String authorNickname,
        String content,
        LocalDateTime createdAt,
        boolean canDelete
) {
}
