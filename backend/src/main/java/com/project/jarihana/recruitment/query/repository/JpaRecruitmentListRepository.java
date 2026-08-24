package com.project.jarihana.recruitment.query.repository;

import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.RegistrationJpaRepository;
import com.project.jarihana.group.query.repository.RegistrationJpaRepository.ApprovedRegistrationCount;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.query.repository.dto.RecruitmentListPage;
import com.project.jarihana.recruitment.query.repository.dto.RecruitmentListProjection;
import com.project.jarihana.recruitment.query.repository.dto.RecruitmentListSearchCriteria;
import com.project.jarihana.registration.domain.RegistrationStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Repository
public class JpaRecruitmentListRepository implements RecruitmentListRepository {

    private final GroupJpaRepository groupRepository;
    private final GroupRecruitmentJpaRepository recruitmentRepository;
    private final RegistrationJpaRepository registrationRepository;

    public JpaRecruitmentListRepository(
            GroupJpaRepository groupRepository,
            GroupRecruitmentJpaRepository recruitmentRepository,
            RegistrationJpaRepository registrationRepository
    ) {
        this.groupRepository = groupRepository;
        this.recruitmentRepository = recruitmentRepository;
        this.registrationRepository = registrationRepository;
    }

    @Override
    public boolean existsGroupById(Long groupId) {
        return groupRepository.existsById(groupId);
    }

    @Override
    public RecruitmentListPage findPage(RecruitmentListSearchCriteria criteria, int size) {
        Slice<GroupRecruitment> recruitments = recruitmentRepository.findPageByGroupId(
                criteria.groupId(),
                criteria.cursorCreatedAt(),
                criteria.cursorId(),
                Pageable.ofSize(size)
        );
        if (recruitments.isEmpty()) {
            return new RecruitmentListPage(List.of(), false);
        }

        Map<Long, Integer> approvedCounts = findApprovedCounts(recruitments.getContent());
        List<RecruitmentListProjection> projections = recruitments.getContent().stream()
                .map(recruitment -> RecruitmentListProjection.of(
                        recruitment,
                        approvedCounts.getOrDefault(recruitment.getId(), 0)
                ))
                .toList();
        return new RecruitmentListPage(projections, recruitments.hasNext());
    }

    private Map<Long, Integer> findApprovedCounts(List<GroupRecruitment> recruitments) {
        List<Long> recruitmentIds = recruitments.stream()
                .map(GroupRecruitment::getId)
                .toList();
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
}
