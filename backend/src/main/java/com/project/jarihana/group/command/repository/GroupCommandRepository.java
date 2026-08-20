package com.project.jarihana.group.command.repository;

import com.project.jarihana.group.domain.Group;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.repository.Repository;

public interface GroupCommandRepository extends Repository<Group, Long> {

    Group save(Group group);

    Optional<Group> findById(Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Group> findWithLockById(long id);

    boolean existsByName(String name);

    boolean existsByNameAndIdNot(String name, Long id);

    void delete(Group group);
}
