package com.project.jarihana.recruitment.query.service.dto;

import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.RecruitmentPhase;

import java.time.LocalDateTime;
import java.util.List;

public record RecruitmentListResult(List<Item> items, String nextCursor, boolean hasNext) {

    public RecruitmentListResult {
        items = List.copyOf(items);
    }

    public record Item(
            GroupRecruitment recruitment,
            int approvedCount,
            RecruitmentPhase phase
    ) {

        public static Item of(
                GroupRecruitment recruitment,
                int approvedCount,
                LocalDateTime now
        ) {
            return new Item(
                    recruitment,
                    approvedCount,
                    recruitment.phaseAt(now)
            );
        }
    }
}
