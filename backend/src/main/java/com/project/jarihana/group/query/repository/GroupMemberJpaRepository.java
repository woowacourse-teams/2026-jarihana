package com.project.jarihana.group.query.repository;

import com.project.jarihana.group.query.repository.dto.GroupDetailMember;
import com.project.jarihana.group.query.repository.dto.GroupListMember;
import com.project.jarihana.groupmember.domain.GroupMember;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface GroupMemberJpaRepository extends JpaRepository<GroupMember, Long> {

    @EntityGraph(attributePaths = "member")
    List<GroupMember> findAllByGroupIdInOrderById(List<Long> groupIds);

    @Query("""
            select new com.project.jarihana.group.query.repository.dto.GroupListMember(
                groupMember.group.id, member.id, member.crewName, member.generation,
                member.memberType, member.githubId, groupMember.role
            )
            from GroupMember groupMember
            join groupMember.member member
            where groupMember.group.id in :groupIds
            order by groupMember.id
            """)
    List<GroupListMember> findListMembersByGroupIds(@Param("groupIds") List<Long> groupIds);

    @Query("""
            select new com.project.jarihana.group.query.repository.dto.GroupDetailMember(
                member.id, member.crewName, member.generation, member.memberType, member.githubId, groupMember.role
            )
            from GroupMember groupMember
            join groupMember.member member
            where groupMember.group.id = :groupId
            order by groupMember.id
            """)
    List<GroupDetailMember> findDetailMembersByGroupId(@Param("groupId") Long groupId);
}
