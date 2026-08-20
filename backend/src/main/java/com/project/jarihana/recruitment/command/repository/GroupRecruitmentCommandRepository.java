package com.project.jarihana.recruitment.command.repository;

import com.project.jarihana.recruitment.domain.GroupRecruitment;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface GroupRecruitmentCommandRepository extends Repository<GroupRecruitment, Long> {

    void deleteAllByGroupId(long groupId);

    List<GroupRecruitment> findAllByGroupId(long groupId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<GroupRecruitment> findWithLockById(long id);

    @Query("""
            select recruitment
            from GroupRecruitment recruitment
            where recruitment.group.id = :groupId
              and (recruitment.endsAt is null or recruitment.endsAt > :now)
            order by recruitment.id
            """)
    List<GroupRecruitment> findActiveByGroupId(
            @Param("groupId") long groupId,
            @Param("now") LocalDateTime now
    );

    GroupRecruitment save(GroupRecruitment recruitment);
}
