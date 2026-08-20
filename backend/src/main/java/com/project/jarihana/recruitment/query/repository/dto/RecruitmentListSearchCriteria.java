package com.project.jarihana.recruitment.query.repository.dto;

import java.time.LocalDateTime;

public record RecruitmentListSearchCriteria(
        Long groupId,
        LocalDateTime cursorCreatedAt,
        Long cursorId
) {
}
