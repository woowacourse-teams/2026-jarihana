package com.project.jarihana.group.query.repository;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.query.repository.dto.GroupDetailMember;
import com.project.jarihana.group.query.repository.dto.GroupDetailProjection;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.query.repository.GroupRecruitmentJpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public class JpaGroupDetailRepository implements GroupDetailRepository {

    private final GroupJpaRepository groupRepository;
    private final GroupMemberJpaRepository groupMemberRepository;
    private final GroupRecruitmentJpaRepository recruitmentRepository;
    private final RegistrationJpaRepository registrationRepository;
    private final GroupVisibilityRepository visibilityRepository;

    public JpaGroupDetailRepository(
            GroupJpaRepository groupRepository,
            GroupMemberJpaRepository groupMemberRepository,
            GroupRecruitmentJpaRepository recruitmentRepository,
            RegistrationJpaRepository registrationRepository,
            GroupVisibilityRepository visibilityRepository
    ) {
        this.groupRepository = groupRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.recruitmentRepository = recruitmentRepository;
        this.registrationRepository = registrationRepository;
        this.visibilityRepository = visibilityRepository;
    }

    @Override
    public Optional<GroupDetailProjection> findById(Long groupId, LocalDateTime now, Long currentMemberId) {
        Optional<Group> group = groupRepository.findById(groupId);
        if (group.isEmpty()) {
            return Optional.empty();
        }

        List<GroupDetailMember> members = groupMemberRepository.findDetailMembersByGroupId(groupId);
        GroupRecruitment activeRecruitment = recruitmentRepository.findCurrentByGroupId(groupId, now)
                .stream()
                .findFirst()
                .orElse(null);
        int approvedCount = findApprovedCount(activeRecruitment);
        Optional<RegistrationJpaRepository.CurrentMemberRegistration> currentMemberRegistration = findCurrentMemberRegistration(
                activeRecruitment,
                currentMemberId
        );
        return Optional.of(GroupDetailProjection.of(
                groupId,
                group.get(),
                members,
                activeRecruitment,
                approvedCount,
                currentMemberRegistration.map(RegistrationJpaRepository.CurrentMemberRegistration::getId).orElse(null),
                currentMemberRegistration.map(RegistrationJpaRepository.CurrentMemberRegistration::getStatus).orElse(null)
        ).withVisibleAffiliationName(findVisibleAffiliationName(group.get())));
    }

    private String findVisibleAffiliationName(Group group) {
        Long affiliationId = group.getVisibleAffiliationId();
        if (affiliationId == null) {
            return null;
        }
        return visibilityRepository.findAffiliationNameById(affiliationId).orElse(null);
    }

    private Optional<RegistrationJpaRepository.CurrentMemberRegistration> findCurrentMemberRegistration(
            GroupRecruitment recruitment,
            Long currentMemberId
    ) {
        if (recruitment == null || currentMemberId == null) {
            return Optional.empty();
        }
        return registrationRepository.findByRecruitmentIdAndMemberId(recruitment.getId(), currentMemberId);
    }

    private int findApprovedCount(GroupRecruitment recruitment) {
        if (recruitment == null) {
            return 0;
        }
        return registrationRepository.countRecruitmentApprovalsByRecruitmentIds(
                        List.of(recruitment.getId())
                )
                .stream()
                .findFirst()
                .map(count -> (int) count.getApprovedCount())
                .orElse(0);
    }
}
