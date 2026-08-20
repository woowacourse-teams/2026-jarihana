package com.project.jarihana.recruitment.query.repository;

import com.project.jarihana.recruitment.domain.GroupRecruitment;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GroupRecruitmentJpaRepository extends JpaRepository<GroupRecruitment, Long> {

    @Query("""
            select recruitment
            from GroupRecruitment recruitment
            where recruitment.group.id = :groupId
              and (
                  :cursorCreatedAt is null
                  or recruitment.createdAt < :cursorCreatedAt
                  or (recruitment.createdAt = :cursorCreatedAt and recruitment.id < :cursorId)
              )
            order by recruitment.createdAt desc, recruitment.id desc
            """)
    Slice<GroupRecruitment> findPageByGroupId(
            @Param("groupId") Long groupId,
            @Param("cursorCreatedAt") LocalDateTime cursorCreatedAt,
            @Param("cursorId") Long cursorId,
            Pageable pageable
    );

    @Query("""
            select recruitment
            from GroupRecruitment recruitment
            where recruitment.group.id in :groupIds
              and (recruitment.endsAt is null or recruitment.endsAt > :now)
            order by recruitment.id desc
            """)
    List<GroupRecruitment> findActiveByGroupIds(
            @Param("groupIds") List<Long> groupIds,
            @Param("now") LocalDateTime now
    );

    @Query("""
            select recruitment
            from GroupRecruitment recruitment
            where recruitment.group.id = :groupId
              and recruitment.startsAt <= :now
              and (recruitment.endsAt is null or recruitment.endsAt > :now)
            order by recruitment.id desc
            """)
    List<GroupRecruitment> findCurrentByGroupId(
            @Param("groupId") Long groupId,
            @Param("now") LocalDateTime now
    );

    @EntityGraph(attributePaths = "group")
    @Query("""
            select recruitment
            from GroupRecruitment recruitment
            where recruitment.id = :recruitmentId
              and recruitment.group.id = :groupId
            """)
    Optional<GroupRecruitment> findByIdAndGroupId(
            @Param("recruitmentId") Long recruitmentId,
            @Param("groupId") Long groupId
    );
}
