package com.project.jarihana.group.query.repository;

import com.project.jarihana.group.query.repository.dto.GroupDetailProjection;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

public class InMemoryGroupDetailRepository implements GroupDetailRepository {

    private final Map<Long, GroupDetailProjection> groups = new HashMap<>();

    @Override
    public Optional<GroupDetailProjection> findById(Long groupId, LocalDateTime now) {
        return Optional.ofNullable(groups.get(groupId));
    }

    public void save(GroupDetailProjection group) {
        groups.put(group.id(), group);
    }

    public void clear() {
        groups.clear();
    }
}
