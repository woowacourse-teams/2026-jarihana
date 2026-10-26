package com.project.jarihana.group.query.repository;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.group.query.repository.RegistrationJpaRepository.ApprovedRegistrationCount;
import com.project.jarihana.group.query.repository.dto.GroupListMember;
import com.project.jarihana.group.query.repository.dto.GroupListPage;
import com.project.jarihana.group.query.repository.dto.GroupListProjection;
import com.project.jarihana.group.query.repository.dto.GroupListSearchCriteria;
import com.project.jarihana.group.query.repository.dto.HomeGroupPages;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.query.repository.GroupRecruitmentJpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

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
        return hydratePages(List.of(findGroups(criteria, size)), criteria.now()).getFirst();
    }

    @Override
    public HomeGroupPages findHomePages(LocalDate sessionDate, LocalDateTime now) {
        Slice<Group> today = findGroups(new GroupListSearchCriteria(
                GroupStatus.ACTIVE, GroupType.SESSION, null, sessionDate, null, false,
                null, null, null, now, null, null), 100);
        Slice<Group> recruiting = findGroups(new GroupListSearchCriteria(
                GroupStatus.ACTIVE, null, null, null, null, false,
                true, null, null, now, null, null), 4);
        Slice<Group> ended = findGroups(new GroupListSearchCriteria(
                GroupStatus.ENDED, null, null, null, null, false,
                null, null, null, now, null, null), 4);
        List<GroupListPage> pages = hydratePages(List.of(today, recruiting, ended), now);
        return new HomeGroupPages(pages.get(0), pages.get(1), pages.get(2));
    }

    private Slice<Group> findGroups(GroupListSearchCriteria criteria, int size) {
        Pageable pageable = Pageable.ofSize(size);
        return groupRepository.findPage(
                criteria.status(),
                criteria.type(),
                criteria.excludedType(),
                criteria.sessionDate(),
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
    }

    private List<GroupListPage> hydratePages(List<Slice<Group>> pages, LocalDateTime now) {
        List<Long> groupIds = pages.stream()
                .flatMap(page -> page.getContent().stream())
                .map(Group::getId)
                .distinct()
                .toList();
        if (groupIds.isEmpty()) {
            return pages.stream().map(page -> new GroupListPage(List.of(), false)).toList();
        }

        Map<Long, List<GroupListMember>> membersByGroup = findMembers(groupIds);
        Map<Long, GroupRecruitment> recruitmentByGroup = findActiveRecruitments(groupIds, now);
        Map<Long, Integer> approvedCounts = findApprovedCounts(recruitmentByGroup.values());

        return pages.stream().map(page -> new GroupListPage(page.getContent().stream()
                .map(group -> toProjection(
                        group,
                        membersByGroup.getOrDefault(group.getId(), List.of()),
                        recruitmentByGroup.get(group.getId()),
                        approvedCounts
                ))
                .toList(), page.hasNext())).toList();
    }

    private Map<Long, List<GroupListMember>> findMembers(List<Long> groupIds) {
        return groupMemberRepository.findListMembersByGroupIds(groupIds)
                .stream()
                .collect(Collectors.groupingBy(GroupListMember::groupId));
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

        return registrationRepository.countRecruitmentApprovalsByRecruitmentIds(
                        recruitmentIds
                )
                .stream()
                .collect(Collectors.toMap(
                        ApprovedRegistrationCount::getRecruitmentId,
                        count -> (int) count.getApprovedCount()
                ));
    }

    private static GroupListProjection toProjection(
            Group group,
            List<GroupListMember> members,
            GroupRecruitment recruitment,
            Map<Long, Integer> approvedCounts
    ) {
        int approvedCount = recruitment == null
                ? 0
                : approvedCounts.getOrDefault(recruitment.getId(), 0);
        return GroupListProjection.of(
                group.getId(),
                group,
                members.size(),
                members,
                recruitment,
                approvedCount
        );
    }
}
