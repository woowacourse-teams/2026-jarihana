package com.project.jarihana.group.query.repository;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.query.repository.dto.GroupDetailMember;
import com.project.jarihana.group.query.repository.dto.GroupDetailProjection;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.query.repository.GroupRecruitmentJpaRepository;
import com.project.jarihana.registration.domain.RegistrationStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Repository;

@Repository
public class JpaGroupDetailRepository implements GroupDetailRepository {

    private final GroupJpaRepository groupRepository;
    private final GroupMemberJpaRepository groupMemberRepository;
    private final GroupRecruitmentJpaRepository recruitmentRepository;
    private final RegistrationJpaRepository registrationRepository;

    public JpaGroupDetailRepository(
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
    public Optional<GroupDetailProjection> findById(Long groupId, LocalDateTime now) {
        Optional<Group> group = groupRepository.findById(groupId);
        if (group.isEmpty()) {
            return Optional.empty();
        }

        List<GroupDetailMember> members = groupMemberRepository
                .findAllByGroup_IdInOrderById(List.of(groupId))
                .stream()
                .map(JpaGroupDetailRepository::toMember)
                .toList();
        GroupRecruitment activeRecruitment = recruitmentRepository.findCurrentByGroupId(groupId, now)
                .stream()
                .findFirst()
                .orElse(null);
        int approvedCount = findApprovedCount(activeRecruitment);
        return Optional.of(GroupDetailProjection.of(
                groupId,
                group.get(),
                members,
                activeRecruitment,
                approvedCount
        ));
    }

    private int findApprovedCount(GroupRecruitment recruitment) {
        if (recruitment == null) {
            return 0;
        }
        return registrationRepository.countByRecruitmentIdsAndStatus(
                        List.of(recruitment.getId()),
                        RegistrationStatus.APPROVED
                )
                .stream()
                .findFirst()
                .map(count -> (int) count.getApprovedCount())
                .orElse(0);
    }

    private static GroupDetailMember toMember(GroupMember member) {
        return GroupDetailMember.of(
                member.getMember().getId(),
                member.getMember(),
                member.getRole()
        );
    }
}
