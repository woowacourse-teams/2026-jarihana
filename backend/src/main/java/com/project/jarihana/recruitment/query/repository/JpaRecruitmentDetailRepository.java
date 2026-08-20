package com.project.jarihana.recruitment.query.repository;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.recruitment.query.repository.GroupRecruitmentJpaRepository;
import com.project.jarihana.group.query.repository.RegistrationJpaRepository;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.query.repository.dto.RecruitmentDetailProjection;
import com.project.jarihana.registration.domain.RegistrationStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Repository;

@Repository
public class JpaRecruitmentDetailRepository implements RecruitmentDetailRepository {

    private final GroupJpaRepository groupRepository;
    private final GroupRecruitmentJpaRepository recruitmentRepository;
    private final RegistrationJpaRepository registrationRepository;

    public JpaRecruitmentDetailRepository(
            GroupJpaRepository groupRepository,
            GroupRecruitmentJpaRepository recruitmentRepository,
            RegistrationJpaRepository registrationRepository
    ) {
        this.groupRepository = groupRepository;
        this.recruitmentRepository = recruitmentRepository;
        this.registrationRepository = registrationRepository;
    }

    @Override
    public Optional<Group> findGroupById(Long groupId) {
        return groupRepository.findById(groupId);
    }

    @Override
    public Optional<RecruitmentDetailProjection> findByGroupIdAndRecruitmentId(
            Long groupId,
            Long recruitmentId
    ) {
        Optional<GroupRecruitment> recruitment = recruitmentRepository.findByIdAndGroupId(
                recruitmentId,
                groupId
        );
        if (recruitment.isEmpty()) {
            return Optional.empty();
        }

        int approvedCount = registrationRepository.countByRecruitmentIdsAndStatus(
                        List.of(recruitmentId),
                        RegistrationStatus.APPROVED
                )
                .stream()
                .findFirst()
                .map(count -> (int) count.getApprovedCount())
                .orElse(0);
        return Optional.of(RecruitmentDetailProjection.of(
                recruitment.get().getGroup(),
                recruitment.get(),
                approvedCount
        ));
    }
}
