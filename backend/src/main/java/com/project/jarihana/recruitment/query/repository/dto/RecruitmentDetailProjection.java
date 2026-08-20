package com.project.jarihana.recruitment.query.repository.dto;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.recruitment.domain.GroupRecruitment;

public record RecruitmentDetailProjection(
        Group group,
        GroupRecruitment recruitment,
        int approvedCount
) {

    public RecruitmentDetailProjection {
        if (group == null || recruitment == null || approvedCount < 0) {
            throw new IllegalArgumentException("모집 공고 상세 조회 정보가 올바르지 않습니다.");
        }
    }

    public static RecruitmentDetailProjection of(
            Group group,
            GroupRecruitment recruitment,
            int approvedCount
    ) {
        return new RecruitmentDetailProjection(group, recruitment, approvedCount);
    }
}
