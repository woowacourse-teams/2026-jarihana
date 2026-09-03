package com.project.jarihana.registration.query.service.dto;

import java.time.LocalDateTime;
import java.util.List;

public record MyRegistrationListResult(
        List<Item> items,
        String nextCursor,
        boolean hasNext
) {

    public MyRegistrationListResult {
        items = List.copyOf(items);
    }

    public record Item(
            Long id,
            Long groupId,
            String groupName,
            String groupRepresentativeImageUrl,
            Long recruitmentId,
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
