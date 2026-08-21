package com.project.jarihana.recruitment.query.controller.dto;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.RecruitmentPhase;
import com.project.jarihana.recruitment.query.service.dto.RecruitmentDetailResult;
import java.time.LocalDateTime;

public record RecruitmentDetailResponse(
        Long id,
        GroupSummary group,
        String joinMethod,
        int capacity,
        int approvedCount,
        int remainingSeats,
        LocalDateTime startsAt,
        LocalDateTime endsAt,
        String recruitingStatus,
        LocalDateTime createdAt
) {

    public static RecruitmentDetailResponse from(RecruitmentDetailResult result) {
        GroupRecruitment recruitment = result.recruitment();
        return new RecruitmentDetailResponse(
                recruitment.getId(),
                GroupSummary.from(result.group()),
                recruitment.getJoinMethod().name(),
                recruitment.getCapacity(),
                result.approvedCount(),
                result.remainingSeats(),
                recruitment.getStartsAt(),
                recruitment.getEndsAt(),
                toRecruitingStatus(result.phase()),
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

    public record GroupSummary(Long id, String name, String status) {

        private static GroupSummary from(Group group) {
            return new GroupSummary(group.getId(), group.getName(), group.getStatus().name());
        }
    }
}
