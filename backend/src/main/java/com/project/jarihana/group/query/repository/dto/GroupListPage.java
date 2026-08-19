package com.project.jarihana.group.query.repository.dto;

import java.util.List;

public record GroupListPage(List<GroupListProjection> items, boolean hasNext) {

    public GroupListPage {
        items = List.copyOf(items);
    }
}
