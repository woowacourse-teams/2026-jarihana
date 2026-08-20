package com.project.jarihana.recruitment.command.repository;

import com.project.jarihana.recruitment.domain.GroupRecruitment;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface GroupRecruitmentCommandRepository extends Repository<GroupRecruitment, Long> {

    void deleteAllByGroupId(long groupId);

    List<GroupRecruitment> findAllByGroupId(long groupId);

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
