package com.project.jarihana.groupmember.query.repository;

import com.project.jarihana.group.domain.Group;
import org.springframework.data.repository.Repository;

public interface GroupExistenceJpaRepository extends Repository<Group, Long> {

    boolean existsById(Long id);
}
