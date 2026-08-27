package com.project.jarihana.group.query.repository;

import com.project.jarihana.groupmember.domain.GroupMember;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GroupMemberJpaRepository extends JpaRepository<GroupMember, Long> {

    @EntityGraph(attributePaths = "member")
    List<GroupMember> findAllByGroupIdInOrderById(List<Long> groupIds);
}
