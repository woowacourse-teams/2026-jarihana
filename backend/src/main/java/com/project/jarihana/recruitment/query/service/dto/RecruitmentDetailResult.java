package com.project.jarihana.recruitment.query.service.dto;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.RecruitmentPhase;
import java.time.LocalDateTime;

public record RecruitmentDetailResult(
        Group group,
        GroupRecruitment recruitment,
        int approvedCount,
        int remainingSeats,
        RecruitmentPhase phase
) {

    public RecruitmentDetailResult {
        if (group == null || recruitment == null || approvedCount < 0 || remainingSeats < 0 || phase == null) {
            throw new IllegalArgumentException("모집 공고 상세 조회 결과가 올바르지 않습니다.");
        }
    }

    public static RecruitmentDetailResult of(
            Group group,
            GroupRecruitment recruitment,
            int approvedCount,
            LocalDateTime now
    ) {
        return new RecruitmentDetailResult(
                group,
                recruitment,
                approvedCount,
                recruitment.getCapacity() - approvedCount,
                recruitment.phaseAt(now)
        );
    }
}
