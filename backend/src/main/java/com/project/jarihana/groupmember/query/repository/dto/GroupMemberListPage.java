package com.project.jarihana.groupmember.query.repository.dto;

import java.util.List;

public record GroupMemberListPage(
        List<GroupMemberListProjection> items,
        boolean hasNext
) {

    public GroupMemberListPage {
        items = List.copyOf(items);
    }
}
