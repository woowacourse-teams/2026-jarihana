package com.project.jarihana.group.command.repository;

import com.project.jarihana.group.domain.Group;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface GroupCommandRepository extends Repository<Group, Long> {

    Group save(Group group);

    Optional<Group> findById(Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Group> findWithLockById(long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select recruitment.group
            from GroupRecruitment recruitment
            where recruitment.id = :recruitmentId
            """)
    Optional<Group> findWithLockByRecruitmentId(@Param("recruitmentId") long recruitmentId);

    boolean existsByName(String name);

    boolean existsByNameAndIdNot(String name, Long id);

    void delete(Group group);
}
