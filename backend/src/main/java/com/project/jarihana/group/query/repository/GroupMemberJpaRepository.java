package com.project.jarihana.group.query.repository;

import com.project.jarihana.groupmember.domain.GroupMember;
import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GroupMemberJpaRepository extends JpaRepository<GroupMember, Long> {

    @EntityGraph(attributePaths = "member")
    List<GroupMember> findAllByGroup_IdInOrderById(List<Long> groupIds);
}
