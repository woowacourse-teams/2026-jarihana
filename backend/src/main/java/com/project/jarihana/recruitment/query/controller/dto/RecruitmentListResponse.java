package com.project.jarihana.recruitment.query.controller.dto;

import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.RecruitmentPhase;
import com.project.jarihana.recruitment.query.service.dto.RecruitmentListResult;
import com.project.jarihana.recruitment.query.service.dto.RecruitmentListResult.Item;
import java.time.LocalDateTime;
import java.util.List;

public record RecruitmentListResponse(
        List<RecruitmentItem> items,
        String nextCursor,
        boolean hasNext
) {

    public RecruitmentListResponse {
        items = List.copyOf(items);
    }

    public static RecruitmentListResponse from(RecruitmentListResult result) {
        return new RecruitmentListResponse(
                result.items().stream().map(RecruitmentItem::from).toList(),
                result.nextCursor(),
                result.hasNext()
        );
    }

    public record RecruitmentItem(
            Long id,
            String joinMethod,
            int capacity,
            int approvedCount,
            LocalDateTime startsAt,
            LocalDateTime endsAt,
            String recruitingStatus,
            LocalDateTime createdAt
    ) {

        private static RecruitmentItem from(Item item) {
            GroupRecruitment recruitment = item.recruitment();
            return new RecruitmentItem(
                    recruitment.getId(),
                    recruitment.getJoinMethod().name(),
                    recruitment.getCapacity(),
                    item.approvedCount(),
                    recruitment.getStartsAt(),
                    recruitment.getEndsAt(),
                    toRecruitingStatus(item.phase()),
                    recruitment.getCreatedAt()
            );
        }

        private static String toRecruitingStatus(RecruitmentPhase phase) {
            return switch (phase) {
                case UPCOMING -> "SCHEDULED";
                case OPEN -> "OPEN";
                case ALWAYS_OPEN -> "ALWAYS_OPEN";
                case CLOSED -> "CLOSED";
            };
        }
    }
}
