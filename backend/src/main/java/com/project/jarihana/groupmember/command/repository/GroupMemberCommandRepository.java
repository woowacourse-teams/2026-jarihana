package com.project.jarihana.groupmember.command.repository;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.domain.Member;
import org.springframework.data.repository.Repository;

import java.util.Optional;

public interface GroupMemberCommandRepository extends Repository<GroupMember, Long> {

    GroupMember save(GroupMember groupMember);

    Optional<GroupMember> findByGroupAndMember(Group group, Member member);

    Optional<GroupMember> findByGroupIdAndMemberId(long groupId, long memberId);

    Optional<GroupMember> findByIdAndGroupId(long groupMemberId, long groupId);

    void deleteAllByGroupId(long groupId);
}
