package com.project.jarihana.groupmember.query.repository;

import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.member.domain.Member;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface GroupMemberAccessRepository extends Repository<GroupMember, Long> {

    boolean existsByGroupIdAndMemberId(long groupId, long memberId);

    @Query("""
            select groupMember.role
            from GroupMember groupMember
            where groupMember.group.id = :groupId
              and groupMember.member.id = :memberId
            """)
    Optional<GroupMemberRole> findRoleByGroupIdAndMemberId(
            @Param("groupId") long groupId,
            @Param("memberId") long memberId
    );

    @Query("""
            select groupMember.member
            from GroupMember groupMember
            where groupMember.group.id = :groupId
              and groupMember.member.id <> :excludedMemberId
              and groupMember.member.withdrawnAt is null
            order by groupMember.member.id
            """)
    List<Member> findNotificationRecipients(
            @Param("groupId") long groupId,
            @Param("excludedMemberId") long excludedMemberId
    );
}
