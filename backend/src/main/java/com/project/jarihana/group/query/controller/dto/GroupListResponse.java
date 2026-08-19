package com.project.jarihana.group.query.controller.dto;

import com.project.jarihana.group.query.service.dto.GroupListResult;
import com.project.jarihana.group.query.service.dto.GroupListResult.ActiveRecruitment;
import com.project.jarihana.group.query.service.dto.GroupListResult.Item;
import com.project.jarihana.group.query.service.dto.GroupListResult.Leader;
import java.time.LocalDateTime;
import java.util.List;

public record GroupListResponse(List<GroupItem> items, String nextCursor, boolean hasNext) {

    public GroupListResponse {
        items = List.copyOf(items);
    }

    public static GroupListResponse from(GroupListResult result) {
        return new GroupListResponse(
                result.items().stream().map(GroupItem::from).toList(),
                result.nextCursor(),
                result.hasNext()
        );
    }

    public record GroupItem(
            Long id,
            String type,
            String status,
            String name,
            String introduction,
            String representativeImageUrl,
            GroupLeader leader,
            int memberCount,
            GroupActiveRecruitment activeRecruitment
    ) {

        private static GroupItem from(Item item) {
            return new GroupItem(
                    item.id(),
                    item.type(),
                    item.status(),
                    item.name(),
                    item.introduction(),
                    item.representativeImageUrl(),
                    item.leader() == null ? null : GroupLeader.from(item.leader()),
                    item.memberCount(),
                    item.activeRecruitment() == null
                            ? null
                            : GroupActiveRecruitment.from(item.activeRecruitment())
            );
        }
    }

    public record GroupLeader(Long memberId, String crewName, int generation) {

        private static GroupLeader from(Leader leader) {
            return new GroupLeader(
                    leader.memberId(),
                    leader.crewName(),
                    leader.generation()
            );
        }
    }

    public record GroupActiveRecruitment(
            Long id,
            String joinMethod,
            int capacity,
            int approvedCount,
            LocalDateTime startsAt,
            LocalDateTime endsAt
    ) {

        private static GroupActiveRecruitment from(ActiveRecruitment recruitment) {
            return new GroupActiveRecruitment(
                    recruitment.id(),
                    recruitment.joinMethod(),
                    recruitment.capacity(),
                    recruitment.approvedCount(),
                    recruitment.startsAt(),
                    recruitment.endsAt()
            );
        }
    }
}
