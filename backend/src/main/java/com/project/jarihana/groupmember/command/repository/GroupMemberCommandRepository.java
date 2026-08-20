package com.project.jarihana.groupmember.command.repository;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.domain.Member;
import java.util.Optional;
import org.springframework.data.repository.Repository;

public interface GroupMemberCommandRepository extends Repository<GroupMember, Long> {

    GroupMember save(GroupMember groupMember);

    Optional<GroupMember> findByGroupAndMember(Group group, Member member);

    void deleteAllByGroup_Id(Long groupId);
}
