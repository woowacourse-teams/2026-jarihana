package com.project.jarihana.registration.query.repository;

import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface RegistrationAccessJpaRepository extends Repository<GroupMember, Long> {

    @Query("""
            select case when count(groupMember) > 0 then true else false end
            from GroupMember groupMember
            where groupMember.group.id = :groupId
              and groupMember.member.id = :memberId
              and groupMember.role = :role
            """)
    boolean existsByGroupIdAndMemberIdAndRole(
            @Param("groupId") Long groupId,
            @Param("memberId") Long memberId,
            @Param("role") GroupMemberRole role
    );
}
