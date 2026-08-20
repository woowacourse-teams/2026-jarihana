package com.project.jarihana.recruitment.query.repository.dto;

import com.project.jarihana.recruitment.domain.GroupRecruitment;

public record RecruitmentListProjection(
        GroupRecruitment recruitment,
        int approvedCount
) {

    public RecruitmentListProjection {
        if (recruitment == null || approvedCount < 0) {
            throw new IllegalArgumentException("모집 공고 이력 조회 정보가 올바르지 않습니다.");
        }
    }

    public static RecruitmentListProjection of(
            GroupRecruitment recruitment,
            int approvedCount
    ) {
        return new RecruitmentListProjection(recruitment, approvedCount);
    }
}
