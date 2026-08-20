package com.project.jarihana.group.command.repository;

import com.project.jarihana.group.domain.Group;
import java.util.Optional;
import org.springframework.data.repository.Repository;

public interface GroupCommandRepository extends Repository<Group, Long> {

    Group save(Group group);

    Optional<Group> findById(Long id);

    boolean existsByName(String name);
}
