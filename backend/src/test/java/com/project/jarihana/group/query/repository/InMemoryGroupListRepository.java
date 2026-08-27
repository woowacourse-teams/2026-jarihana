package com.project.jarihana.group.query.repository;

import com.project.jarihana.group.query.repository.dto.GroupListPage;
import com.project.jarihana.group.query.repository.dto.GroupListProjection;
import com.project.jarihana.group.query.repository.dto.GroupListSearchCriteria;

import java.util.Comparator;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

public class InMemoryGroupListRepository implements GroupListRepository {

    private final List<GroupListProjection> groups = new CopyOnWriteArrayList<>();

    @Override
    public GroupListPage findPage(
            GroupListSearchCriteria criteria,
            int size
    ) {
        List<GroupListProjection> filteredGroups = groups.stream()
                .filter(projection -> projection.group().getStatus() == criteria.status())
                .filter(projection -> criteria.type() == null
                        || projection.group().getType() == criteria.type())
                .filter(projection -> criteria.keyword() == null
                        || projection.group().getName().contains(criteria.keyword())
                        || projection.group().getIntroduction().contains(criteria.keyword()))
                .filter(projection -> !criteria.joinedOnly()
                        || projection.hasMember(criteria.currentMemberId()))
                .filter(projection -> criteria.role() == null
                        || projection.hasRole(criteria.currentMemberId(), criteria.role()))
                .filter(projection -> criteria.recruiting() == null
                        || criteria.recruiting() == isRecruiting(projection, criteria.now()))
                .filter(projection -> criteria.cursorCreatedAt() == null
                        || projection.group().getCreatedAt().isBefore(criteria.cursorCreatedAt())
                        || projection.group().getCreatedAt().equals(criteria.cursorCreatedAt())
                        && projection.id() < criteria.cursorId())
                .sorted(Comparator
                        .comparing((GroupListProjection projection) -> projection.group().getCreatedAt())
                        .reversed()
                        .thenComparing(Comparator.comparing(GroupListProjection::id).reversed()))
                .toList();
        int endIndex = Math.min(size, filteredGroups.size());
        return new GroupListPage(
                filteredGroups.subList(0, endIndex),
                endIndex < filteredGroups.size()
        );
    }

    public void save(GroupListProjection group) {
        groups.removeIf(existing -> existing.id().equals(group.id()));
        groups.add(group);
    }

    public void clear() {
        groups.clear();
    }

    private static boolean isRecruiting(GroupListProjection projection, java.time.LocalDateTime now) {
        return projection.activeRecruitment() != null
                && projection.activeRecruitment().isOpenAt(now)
                && projection.approvedCount() < projection.activeRecruitment().getCapacity();
    }
}
