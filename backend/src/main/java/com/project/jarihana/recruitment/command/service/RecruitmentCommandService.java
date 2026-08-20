package com.project.jarihana.recruitment.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.recruitment.command.repository.GroupRecruitmentCommandRepository;
import com.project.jarihana.recruitment.command.service.dto.CreateRecruitmentCommand;
import com.project.jarihana.recruitment.command.service.dto.CreateRecruitmentResult;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.registration.command.repository.RegistrationCommandRepository;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.RegistrationStatus;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class RecruitmentCommandService {

    private final GroupCommandRepository groupCommandRepository;
    private final GroupMemberCommandRepository groupMemberCommandRepository;
    private final GroupRecruitmentCommandRepository recruitmentRepository;
    private final RegistrationCommandRepository registrationRepository;
    private final Clock clock;

    @Transactional
    public CreateRecruitmentResult createRecruitment(
            long memberId,
            long groupId,
            CreateRecruitmentCommand command
    ) {
        Group group = groupCommandRepository.findWithLockById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다."));
        GroupMember requester = groupMemberCommandRepository.findByGroupIdAndMemberId(groupId, memberId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.GROUP_ACCESS_DENIED,
                        "현재 모임장만 모집 공고를 등록할 수 있습니다."
                ));
        if (requester.getRole() != GroupMemberRole.LEADER) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, "현재 모임장만 모집 공고를 등록할 수 있습니다.");
        }
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 그룹에는 모집 공고를 등록할 수 없습니다.");
        }

        LocalDateTime now = LocalDateTime.now(clock);
        GroupRecruitment newRecruitment = GroupRecruitment.create(
                group,
                command.joinMethod(),
                command.capacity(),
                command.startsAt(),
                command.endsAt()
        );
        List<GroupRecruitment> activeRecruitments = recruitmentRepository.findActiveByGroupId(groupId, now);
        activeRecruitments.stream()
                .map(recruitment -> recruitment.closeAt(now))
                .forEach(recruitmentRepository::save);
        rejectPendingRegistrations(activeRecruitments, now);

        GroupRecruitment saved = recruitmentRepository.save(newRecruitment);
        return CreateRecruitmentResult.of(saved, now);
    }

    private void rejectPendingRegistrations(List<GroupRecruitment> recruitments, LocalDateTime now) {
        if (recruitments.isEmpty()) {
            return;
        }
        List<Long> recruitmentIds = recruitments.stream()
                .map(GroupRecruitment::getId)
                .toList();
        for (Registration registration : registrationRepository.findAllByRecruitmentIdInAndStatus(
                recruitmentIds,
                RegistrationStatus.PENDING
        )) {
            registrationRepository.save(registration.rejectBySystem("새 모집 공고 등록", now));
        }
    }
}
