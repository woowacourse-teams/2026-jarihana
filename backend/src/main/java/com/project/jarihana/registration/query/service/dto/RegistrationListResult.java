package com.project.jarihana.registration.query.service.dto;

import java.time.LocalDateTime;
import java.util.List;

public record RegistrationListResult(
        List<Item> items,
        String nextCursor,
        boolean hasNext
) {

    public RegistrationListResult {
        items = List.copyOf(items);
    }

    public record Item(
            Long id,
            Long memberId,
            String crewName,
            Integer generation,
            String course,
            String message,
            String status,
            LocalDateTime registeredAt,
            String decisionReason,
            LocalDateTime decidedAt,
            String decidedByType,
            Long decidedByMemberId
    ) {
    }
}
