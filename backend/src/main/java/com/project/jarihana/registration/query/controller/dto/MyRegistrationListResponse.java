package com.project.jarihana.registration.query.controller.dto;

import com.project.jarihana.registration.query.service.dto.MyRegistrationListResult;

import java.time.LocalDateTime;
import java.util.List;

public record MyRegistrationListResponse(
        List<MyRegistrationItem> items,
        String nextCursor,
        boolean hasNext
) {

    public MyRegistrationListResponse {
        items = List.copyOf(items);
    }

    public static MyRegistrationListResponse from(MyRegistrationListResult result) {
        return new MyRegistrationListResponse(
                result.items().stream().map(MyRegistrationItem::from).toList(),
                result.nextCursor(),
                result.hasNext()
        );
    }

    public record MyRegistrationItem(
            Long id,
            GroupResponse group,
            Long recruitmentId,
            String message,
            String status,
            LocalDateTime registeredAt,
            String decisionReason,
            LocalDateTime decidedAt,
            DecisionActorResponse decidedBy
    ) {

        private static MyRegistrationItem from(MyRegistrationListResult.Item item) {
            return new MyRegistrationItem(
                    item.id(),
                    new GroupResponse(item.groupId(), item.groupName()),
                    item.recruitmentId(),
                    item.message(),
                    item.status(),
                    item.registeredAt(),
                    item.decisionReason(),
                    item.decidedAt(),
                    item.decidedByType() == null
                            ? null
                            : new DecisionActorResponse(item.decidedByType(), item.decidedByMemberId())
            );
        }
    }

    public record GroupResponse(Long id, String name) {
    }

    public record DecisionActorResponse(String type, Long memberId) {
    }
}
