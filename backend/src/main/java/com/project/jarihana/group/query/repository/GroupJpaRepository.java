package com.project.jarihana.group.query.repository;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import java.time.LocalDateTime;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GroupJpaRepository extends JpaRepository<Group, Long> {

    @Query("""
            select g
            from Group g
            where g.status = :status
              and (cast(:type as String) is null or g.type = :type)
              and (
                  cast(:keyword as String) is null
                  or lower(g.name) like lower(concat('%', cast(:keyword as String), '%'))
                  or lower(g.introduction) like lower(concat('%', cast(:keyword as String), '%'))
              )
              and (
                  cast(:cursorCreatedAt as LocalDateTime) is null
                  or g.createdAt < :cursorCreatedAt
                  or (g.createdAt = :cursorCreatedAt and g.id < :cursorId)
              )
              and (
                  :joinedOnly = false
                  or exists (
                      select member.id
                      from GroupMember member
                      where member.group = g
                        and member.member.id = :currentMemberId
                  )
              )
              and (
                  cast(:role as String) is null
                  or exists (
                      select member.id
                      from GroupMember member
                      where member.group = g
                        and member.member.id = :currentMemberId
                        and member.role = :role
                  )
              )
              and (
                  :recruiting = false
                  or exists (
                      select recruitment.id
                      from GroupRecruitment recruitment
                      where recruitment.group = g
                        and recruitment.startsAt <= :now
                        and (recruitment.endsAt is null or recruitment.endsAt > :now)
                  )
              )
            order by g.createdAt desc, g.id desc
            """)
    Slice<Group> findPage(
            @Param("status") GroupStatus status,
            @Param("type") GroupType type,
            @Param("keyword") String keyword,
            @Param("cursorCreatedAt") LocalDateTime cursorCreatedAt,
            @Param("cursorId") Long cursorId,
            @Param("joinedOnly") boolean joinedOnly,
            @Param("role") GroupMemberRole role,
            @Param("currentMemberId") Long currentMemberId,
            @Param("recruiting") boolean recruiting,
            @Param("now") LocalDateTime now,
            Pageable pageable
    );
}
