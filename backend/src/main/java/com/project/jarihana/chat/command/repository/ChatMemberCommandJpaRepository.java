package com.project.jarihana.chat.command.repository;

import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.domain.Member;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ChatMemberCommandJpaRepository extends Repository<GroupMember, Long> {
    @Query(
            """
            select membership.member from GroupMember membership
            where membership.group.id = :groupId and membership.member.id = :memberId
              and membership.member.withdrawnAt is null
            """)
    Optional<Member> findActiveMember(
            @Param("groupId") long groupId, @Param("memberId") long memberId);

    @Query(
            "select membership.member.id from GroupMember membership where membership.group.id ="
                + " :groupId")
    List<Long> findMemberIds(@Param("groupId") long groupId);
}
