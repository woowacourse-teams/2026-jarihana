package com.project.jarihana.group.query.repository;

import com.project.jarihana.group.query.repository.dto.GroupDetailProjection;

import java.time.LocalDateTime;
import java.util.Optional;

public interface GroupDetailRepository {

    Optional<GroupDetailProjection> findById(Long groupId, LocalDateTime now);
}
