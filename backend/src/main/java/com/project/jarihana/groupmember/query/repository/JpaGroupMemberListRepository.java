package com.project.jarihana.groupmember.query.repository;

import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.query.repository.dto.GroupMemberListPage;
import com.project.jarihana.groupmember.query.repository.dto.GroupMemberListProjection;
import com.project.jarihana.groupmember.query.repository.dto.GroupMemberListSearchCriteria;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Repository;

@Repository
public class JpaGroupMemberListRepository implements GroupMemberListRepository {

    private final GroupExistenceJpaRepository groupRepository;
    private final GroupMemberListJpaRepository groupMemberRepository;

    public JpaGroupMemberListRepository(
            GroupExistenceJpaRepository groupRepository,
            GroupMemberListJpaRepository groupMemberRepository
    ) {
        this.groupRepository = groupRepository;
        this.groupMemberRepository = groupMemberRepository;
    }

    @Override
    public boolean existsGroupById(Long groupId) {
        return groupRepository.existsById(groupId);
    }

    @Override
    public GroupMemberListPage findPage(GroupMemberListSearchCriteria criteria, int size) {
        Slice<GroupMember> members = groupMemberRepository.findPage(
                criteria.groupId(),
                criteria.cursorJoinedAt(),
                criteria.cursorId(),
                Pageable.ofSize(size)
        );
        List<GroupMemberListProjection> projections = members.getContent().stream()
                .map(JpaGroupMemberListRepository::toProjection)
                .toList();
        return new GroupMemberListPage(projections, members.hasNext());
    }

    private static GroupMemberListProjection toProjection(GroupMember groupMember) {
        return new GroupMemberListProjection(
                groupMember.getId(),
                groupMember.getMember().getId(),
                groupMember.getMember().getCrewName(),
                groupMember.getMember().getGeneration(),
                groupMember.getMember().getCourse(),
                groupMember.getRole(),
                groupMember.getJoinedAt()
        );
    }
}
