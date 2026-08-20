package com.project.jarihana.group.query.repository;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.query.repository.RegistrationJpaRepository.ApprovedRegistrationCount;
import com.project.jarihana.group.query.repository.dto.GroupListMember;
import com.project.jarihana.group.query.repository.dto.GroupListPage;
import com.project.jarihana.group.query.repository.dto.GroupListProjection;
import com.project.jarihana.group.query.repository.dto.GroupListSearchCriteria;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.query.repository.GroupRecruitmentJpaRepository;
import com.project.jarihana.registration.domain.RegistrationStatus;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Repository;

@Repository
public class JpaGroupListRepository implements GroupListRepository {

    private final GroupJpaRepository groupRepository;
    private final GroupMemberJpaRepository groupMemberRepository;
    private final GroupRecruitmentJpaRepository recruitmentRepository;
    private final RegistrationJpaRepository registrationRepository;

    public JpaGroupListRepository(
            GroupJpaRepository groupRepository,
            GroupMemberJpaRepository groupMemberRepository,
            GroupRecruitmentJpaRepository recruitmentRepository,
            RegistrationJpaRepository registrationRepository
    ) {
        this.groupRepository = groupRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.recruitmentRepository = recruitmentRepository;
        this.registrationRepository = registrationRepository;
    }

    @Override
    public GroupListPage findPage(GroupListSearchCriteria criteria, int size) {
        Pageable pageable = Pageable.ofSize(size);
        Slice<Group> groups = groupRepository.findPage(
                criteria.status(),
                criteria.type(),
                criteria.keyword(),
                criteria.cursorCreatedAt(),
                criteria.cursorId(),
                criteria.joinedOnly(),
                criteria.role(),
                criteria.currentMemberId(),
                criteria.recruiting(),
                criteria.now(),
                pageable
        );
        if (groups.isEmpty()) {
            return new GroupListPage(List.of(), false);
        }

        List<Long> groupIds = groups.getContent().stream().map(Group::getId).toList();
        Map<Long, List<GroupMember>> membersByGroup = findMembers(groupIds);
        Map<Long, GroupRecruitment> recruitmentByGroup = findActiveRecruitments(groupIds, criteria.now());
        Map<Long, Integer> approvedCounts = findApprovedCounts(recruitmentByGroup.values());

        List<GroupListProjection> projections = groups.getContent().stream()
                .map(group -> toProjection(
                        group,
                        membersByGroup.getOrDefault(group.getId(), List.of()),
                        recruitmentByGroup.get(group.getId()),
                        approvedCounts
                ))
                .toList();
        return new GroupListPage(projections, groups.hasNext());
    }

    private Map<Long, List<GroupMember>> findMembers(List<Long> groupIds) {
        return groupMemberRepository.findAllByGroup_IdInOrderById(groupIds)
                .stream()
                .collect(Collectors.groupingBy(member -> member.getGroup().getId()));
    }

    private Map<Long, GroupRecruitment> findActiveRecruitments(List<Long> groupIds, LocalDateTime now) {
        Map<Long, GroupRecruitment> result = new HashMap<>();
        recruitmentRepository.findActiveByGroupIds(groupIds, now)
                .forEach(recruitment -> result.putIfAbsent(
                        recruitment.getGroup().getId(),
                        recruitment
                ));
        return result;
    }

    private Map<Long, Integer> findApprovedCounts(Iterable<GroupRecruitment> recruitments) {
        List<Long> recruitmentIds = StreamSupport.stream(recruitments.spliterator(), false)
                .map(GroupRecruitment::getId)
                .toList();
        if (recruitmentIds.isEmpty()) {
            return Map.of();
        }

        return registrationRepository.countByRecruitmentIdsAndStatus(
                        recruitmentIds,
                        RegistrationStatus.APPROVED
                )
                .stream()
                .collect(Collectors.toMap(
                        ApprovedRegistrationCount::getRecruitmentId,
                        count -> (int) count.getApprovedCount()
                ));
    }

    private static GroupListProjection toProjection(
            Group group,
            List<GroupMember> members,
            GroupRecruitment recruitment,
            Map<Long, Integer> approvedCounts
    ) {
        List<GroupListMember> groupMembers = members.stream()
                .map(member -> GroupListMember.of(
                        member.getMember().getId(),
                        member.getMember(),
                        member.getRole()
                ))
                .toList();
        int approvedCount = recruitment == null
                ? 0
                : approvedCounts.getOrDefault(recruitment.getId(), 0);
        return GroupListProjection.of(
                group.getId(),
                group,
                groupMembers.size(),
                groupMembers,
                recruitment,
                approvedCount
        );
    }
}
