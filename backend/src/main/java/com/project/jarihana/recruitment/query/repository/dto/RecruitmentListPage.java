package com.project.jarihana.recruitment.query.repository.dto;

import java.util.List;

public record RecruitmentListPage(List<RecruitmentListProjection> items, boolean hasNext) {

    public RecruitmentListPage {
        items = List.copyOf(items);
    }
}
