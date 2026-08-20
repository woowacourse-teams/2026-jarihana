package com.project.jarihana.registration.query.controller.dto;

import com.project.jarihana.registration.query.service.dto.RegistrationListResult;
import java.time.LocalDateTime;
import java.util.List;

public record RegistrationListResponse(
        List<RegistrationItem> items,
        String nextCursor,
        boolean hasNext
) {

    public RegistrationListResponse {
        items = List.copyOf(items);
    }

    public static RegistrationListResponse from(RegistrationListResult result) {
        return new RegistrationListResponse(
                result.items().stream().map(RegistrationItem::from).toList(),
                result.nextCursor(),
                result.hasNext()
        );
    }

    public record RegistrationItem(
            Long id,
            MemberResponse member,
            String message,
            String status,
            LocalDateTime registeredAt,
            String decisionReason,
            LocalDateTime decidedAt,
            DecisionActorResponse decidedBy
    ) {

        private static RegistrationItem from(RegistrationListResult.Item item) {
            return new RegistrationItem(
                    item.id(),
                    new MemberResponse(
                            item.memberId(),
                            item.crewName(),
                            item.generation(),
                            item.course()
                    ),
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

    public record MemberResponse(
            Long id,
            String crewName,
            int generation,
            String course
    ) {
    }

    public record DecisionActorResponse(
            String type,
            Long memberId
    ) {
    }
}
