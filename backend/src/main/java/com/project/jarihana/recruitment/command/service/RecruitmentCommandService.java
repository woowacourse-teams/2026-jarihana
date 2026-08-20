package com.project.jarihana.recruitment.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.recruitment.command.repository.GroupRecruitmentCommandRepository;
import com.project.jarihana.recruitment.command.service.dto.CloseRecruitmentResult;
import com.project.jarihana.recruitment.command.service.dto.CreateRecruitmentCommand;
import com.project.jarihana.recruitment.command.service.dto.CreateRecruitmentResult;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.RecruitmentPhase;
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
    public CloseRecruitmentResult closeRecruitment(long memberId, long groupId, long recruitmentId) {
        Group group = groupCommandRepository.findWithLockById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다."));
        GroupMember requester = groupMemberCommandRepository.findByGroupIdAndMemberId(groupId, memberId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.RECRUITMENT_ACCESS_DENIED,
                        "현재 모임장만 모집 공고를 조기 마감할 수 있습니다."
                ));
        if (requester.getRole() != GroupMemberRole.LEADER) {
            throw new BusinessException(
                    ErrorCode.RECRUITMENT_ACCESS_DENIED,
                    "현재 모임장만 모집 공고를 조기 마감할 수 있습니다."
            );
        }
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 그룹의 모집 공고는 조기 마감할 수 없습니다.");
        }
        GroupRecruitment recruitment = recruitmentRepository.findWithLockByIdAndGroupId(recruitmentId, groupId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.RECRUITMENT_NOT_FOUND,
                        "모집 공고를 찾을 수 없습니다."
                ));
        LocalDateTime now = LocalDateTime.now(clock);
        if (recruitment.phaseAt(now) == RecruitmentPhase.CLOSED) {
            throw new BusinessException(ErrorCode.RECRUITMENT_ALREADY_CLOSED, "이미 마감된 모집 공고입니다.");
        }
        GroupRecruitment closed = recruitmentRepository.save(recruitment.closeAt(now));
        return CloseRecruitmentResult.of(closed, now);
    }

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
