package com.project.jarihana.groupmember.query.repository;

import com.project.jarihana.groupmember.domain.GroupMember;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

public interface GroupMemberListJpaRepository extends JpaRepository<GroupMember, Long> {

    @EntityGraph(attributePaths = "member")
    @Query("""
            select groupMember
            from GroupMember groupMember
            where groupMember.group.id = :groupId
              and (
                  cast(:cursorJoinedAt as LocalDateTime) is null
                  or groupMember.joinedAt < :cursorJoinedAt
                  or (groupMember.joinedAt = :cursorJoinedAt and groupMember.id < :cursorId)
              )
            order by groupMember.joinedAt desc, groupMember.id desc
            """)
    Slice<GroupMember> findPage(
            @Param("groupId") Long groupId,
            @Param("cursorJoinedAt") LocalDateTime cursorJoinedAt,
            @Param("cursorId") Long cursorId,
            Pageable pageable
    );
}
