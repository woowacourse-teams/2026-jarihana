package com.project.jarihana.groupspace.command.repository;

import com.project.jarihana.groupspace.domain.GroupSpace;
import java.util.Optional;
import org.springframework.data.repository.Repository;

public interface GroupSpaceCommandRepository extends Repository<GroupSpace, Long> {
    Optional<GroupSpace> findByGroupId(long groupId);
    GroupSpace saveAndFlush(GroupSpace space);
}
