package com.project.jarihana.registration.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.command.repository.GroupRecruitmentCommandRepository;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.registration.command.repository.RegistrationCommandRepository;
import com.project.jarihana.registration.command.service.dto.CreateRegistrationCommand;
import com.project.jarihana.registration.command.service.dto.CreateRegistrationResult;
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
public class RegistrationCommandService {

    private final GroupCommandRepository groupRepository;
    private final GroupRecruitmentCommandRepository recruitmentRepository;
    private final RegistrationCommandRepository registrationRepository;
    private final GroupMemberCommandRepository groupMemberRepository;
    private final MemberRepository memberRepository;
    private final Clock clock;

    @Transactional
    public CreateRegistrationResult createRegistration(
            long memberId,
            long recruitmentId,
            CreateRegistrationCommand command
    ) {
        groupRepository.findWithLockByRecruitmentId(recruitmentId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.RECRUITMENT_NOT_FOUND,
                        "모집 공고를 찾을 수 없습니다."
                ));
        GroupRecruitment recruitment = recruitmentRepository.findWithLockById(recruitmentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RECRUITMENT_NOT_FOUND, "모집 공고를 찾을 수 없습니다."));
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "회원 정보를 찾을 수 없습니다."));
        LocalDateTime now = LocalDateTime.now(clock);
        int approvedCount = validateRegistration(recruitment, memberId, now);
        Registration registration = switch (recruitment.getJoinMethod()) {
            case APPROVAL -> Registration.createPending(recruitment, member, command.message(), now);
            case AUTO -> createAutoApprovedRegistration(
                    recruitment,
                    member,
                    command.message(),
                    now,
                    approvedCount
            );
        };
        registration = registrationRepository.save(registration);
        return CreateRegistrationResult.from(registration);
    }

    private int validateRegistration(GroupRecruitment recruitment, long memberId, LocalDateTime now) {
        long groupId = recruitment.getGroup().getId();
        if (!recruitment.getGroup().isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 그룹에는 가입 신청할 수 없습니다.");
        }
        if (groupMemberRepository.findByGroupIdAndMemberId(groupId, memberId).isPresent()) {
            throw new BusinessException(ErrorCode.GROUP_MEMBER_ALREADY_EXISTS, "이미 가입한 그룹입니다.");
        }
        if (registrationRepository.existsByRecruitmentIdAndMemberId(recruitment.getId(), memberId)) {
            throw new BusinessException(ErrorCode.REGISTRATION_ALREADY_EXISTS, "이미 해당 모집 공고에 신청했습니다.");
        }
        if (registrationRepository.existsByRecruitmentGroupIdAndMemberIdAndStatus(
                groupId,
                memberId,
                RegistrationStatus.PENDING
        )) {
            throw new BusinessException(
                    ErrorCode.GROUP_PENDING_REGISTRATION_EXISTS,
                    "같은 그룹의 다른 모집 공고에 대기 중인 신청이 있습니다."
            );
        }
        int approvedCount = 0;
        if (recruitment.getJoinMethod() == JoinMethod.AUTO) {
            approvedCount = approvedCount(recruitment.getId());
            if (!recruitment.hasCapacity(approvedCount)) {
                throw new BusinessException(ErrorCode.RECRUITMENT_CAPACITY_EXCEEDED, "모집 정원이 모두 찼습니다.");
            }
        }
        if (!recruitment.isOpenAt(now)) {
            throw new BusinessException(ErrorCode.RECRUITMENT_NOT_OPEN, "현재 모집 중인 공고가 아닙니다.");
        }
        return approvedCount;
    }

    private Registration createAutoApprovedRegistration(
            GroupRecruitment recruitment,
            Member member,
            String message,
            LocalDateTime now,
            int approvedCount
    ) {
        Registration registration = Registration.createAutoApproved(
                recruitment,
                member,
                message,
                now,
                approvedCount
        );
        groupMemberRepository.save(GroupMember.createMember(recruitment.getGroup(), member, now));
        closeRecruitmentIfFull(recruitment, approvedCount + 1, now);
        return registration;
    }

    private int approvedCount(long recruitmentId) {
        return Math.toIntExact(registrationRepository.countByRecruitmentIdAndStatus(
                recruitmentId,
                RegistrationStatus.APPROVED
        ));
    }

    private void closeRecruitmentIfFull(
            GroupRecruitment recruitment,
            int approvedCount,
            LocalDateTime now
    ) {
        if (recruitment.hasCapacity(approvedCount)) {
            return;
        }
        recruitmentRepository.save(recruitment.closeAt(now));
        registrationRepository.findAllByRecruitmentIdInAndStatus(
                        List.of(recruitment.getId()),
                        RegistrationStatus.PENDING
                ).stream()
                .map(registration -> registration.rejectBySystem("모집 정원 마감", now))
                .forEach(registrationRepository::save);
    }
}
