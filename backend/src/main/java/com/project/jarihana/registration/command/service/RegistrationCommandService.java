package com.project.jarihana.registration.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.common.transaction.ConcurrentCommandExecutor;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.command.repository.GroupRecruitmentCommandRepository;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.recruitment.domain.RecruitmentPhase;
import com.project.jarihana.registration.command.repository.RegistrationCommandRepository;
import com.project.jarihana.registration.command.service.dto.CreateRegistrationCommand;
import com.project.jarihana.registration.command.service.dto.CreateRegistrationResult;
import com.project.jarihana.registration.command.service.dto.DecideRegistrationCommand;
import com.project.jarihana.registration.command.service.dto.DecideRegistrationResult;
import com.project.jarihana.registration.domain.DecisionActor;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.ApprovalOrigin;
import com.project.jarihana.registration.domain.RegistrationStatus;
import com.project.jarihana.registration.domain.event.RegistrationSubmittedEvent;
import com.project.jarihana.registration.domain.event.RegistrationDecidedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class RegistrationCommandService {

    private final GroupCommandRepository groupRepository;
    private final GroupRecruitmentCommandRepository recruitmentRepository;
    private final RegistrationCommandRepository registrationRepository;
    private final GroupMemberCommandRepository groupMemberRepository;
    private final MemberRepository memberRepository;
    private final Clock clock;
    private final ApplicationEventPublisher events;
    private final ConcurrentCommandExecutor concurrentCommands;

    public CreateRegistrationResult createRegistration(
            long memberId,
            long recruitmentId,
            CreateRegistrationCommand command
    ) {
        return concurrentCommands.execute(() -> createRegistrationInTransaction(memberId, recruitmentId, command));
    }

    private CreateRegistrationResult createRegistrationInTransaction(
            long memberId,
            long recruitmentId,
            CreateRegistrationCommand command
    ) {
        long groupId = groupRepository.findIdWithSharedLockByRecruitmentId(recruitmentId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.RECRUITMENT_NOT_FOUND,
                        "모집 공고를 찾을 수 없습니다."
                ));
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RECRUITMENT_NOT_FOUND, "모집 공고를 찾을 수 없습니다."));
        Member member = memberRepository.findWithLockById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "회원 정보를 찾을 수 없습니다."));
        validateApplicant(group, recruitmentId, memberId);

        GroupRecruitment recruitment = recruitmentRepository.findWithLockById(recruitmentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RECRUITMENT_NOT_FOUND, "모집 공고를 찾을 수 없습니다."));
        LocalDateTime now = LocalDateTime.now(clock);
        int approvedCount = validateRecruitment(recruitment, now);
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
        Registration saved = registration;
        groupMemberRepository.findByGroupIdAndRole(recruitment.getGroup().getId(), GroupMemberRole.LEADER)
                .ifPresent(leader -> events.publishEvent(RegistrationSubmittedEvent.from(saved, leader.getMember().getId())));
        if (saved.getStatus() == RegistrationStatus.APPROVED) {
            events.publishEvent(RegistrationDecidedEvent.from(saved));
        }
        return CreateRegistrationResult.from(registration);
    }

    private void validateApplicant(Group group, long recruitmentId, long memberId) {
        long groupId = group.getId();
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 그룹에는 가입 신청할 수 없습니다.");
        }
        if (groupMemberRepository.findByGroupIdAndMemberId(groupId, memberId).isPresent()) {
            throw new BusinessException(ErrorCode.GROUP_MEMBER_ALREADY_EXISTS, "이미 가입한 그룹입니다.");
        }
        if (registrationRepository.existsByRecruitmentIdAndMemberId(recruitmentId, memberId)) {
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
    }

    private int validateRecruitment(GroupRecruitment recruitment, LocalDateTime now) {
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

    private int approvedCount(long recruitmentId) {
        return Math.toIntExact(registrationRepository.countByRecruitmentIdAndStatusAndApprovalOrigin(
                recruitmentId,
                RegistrationStatus.APPROVED,
                ApprovalOrigin.RECRUITMENT
        ));
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

    private void closeRecruitmentIfFull(
            GroupRecruitment recruitment,
            int approvedCount,
            LocalDateTime now
    ) {
        if (recruitment.hasCapacity(approvedCount)) {
            return;
        }
        if (recruitment.phaseAt(now) != RecruitmentPhase.CLOSED) {
            recruitmentRepository.save(recruitment.closeAt(now));
        }
    }

    public void withdrawRegistration(long memberId, long recruitmentId, long registrationId) {
        concurrentCommands.execute(() -> {
            withdrawRegistrationInTransaction(memberId, recruitmentId, registrationId);
            return null;
        });
    }

    private void withdrawRegistrationInTransaction(long memberId, long recruitmentId, long registrationId) {
        groupRepository.findWithOptimisticLockByRecruitmentId(recruitmentId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.RECRUITMENT_NOT_FOUND,
                        "모집 공고를 찾을 수 없습니다."
                ));
        GroupRecruitment recruitment = recruitmentRepository.findWithLockById(recruitmentId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.RECRUITMENT_NOT_FOUND,
                        "모집 공고를 찾을 수 없습니다."
                ));
        Registration registration = registrationRepository.findWithLockByIdAndRecruitmentId(
                        registrationId,
                        recruitmentId
                )
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.REGISTRATION_NOT_FOUND,
                        "가입 신청을 찾을 수 없습니다."
                ));
        if (registration.getMember().getId() != memberId) {
            throw new BusinessException(ErrorCode.REGISTRATION_ACCESS_DENIED, "본인의 가입 신청만 철회할 수 있습니다.");
        }
        if (!registration.canWithdraw()) {
            throw new BusinessException(ErrorCode.REGISTRATION_ALREADY_DECIDED, "이미 처리된 가입 신청은 철회할 수 없습니다.");
        }
        if (!recruitment.isOpenAt(LocalDateTime.now(clock))) {
            throw new BusinessException(ErrorCode.RECRUITMENT_NOT_OPEN, "모집 중인 공고의 가입 신청만 철회할 수 있습니다.");
        }
        registrationRepository.delete(registration);
    }

    public DecideRegistrationResult decideRegistration(
            long memberId,
            long recruitmentId,
            long registrationId,
            DecideRegistrationCommand command
    ) {
        return concurrentCommands.execute(() -> decideRegistrationInTransaction(memberId, recruitmentId, registrationId, command));
    }

    private DecideRegistrationResult decideRegistrationInTransaction(
            long memberId,
            long recruitmentId,
            long registrationId,
            DecideRegistrationCommand command
    ) {
        Group group = groupRepository.findWithOptimisticLockByRecruitmentId(recruitmentId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.REGISTRATION_NOT_FOUND,
                        "가입 신청을 찾을 수 없습니다."
                ));
        GroupRecruitment recruitment = recruitmentRepository.findWithLockById(recruitmentId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.REGISTRATION_NOT_FOUND,
                        "가입 신청을 찾을 수 없습니다."
                ));
        validateDecisionAuthority(group, memberId);
        Registration registration = registrationRepository.findByIdAndRecruitmentId(
                        registrationId,
                        recruitmentId
                )
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.REGISTRATION_NOT_FOUND,
                        "가입 신청을 찾을 수 없습니다."
                ));
        if (registration.getStatus() != RegistrationStatus.PENDING) {
            throw new BusinessException(ErrorCode.REGISTRATION_ALREADY_DECIDED, "이미 처리된 가입 신청입니다.");
        }

        Registration decidedRegistration = switch (command.status()) {
            case APPROVED -> approveRegistration(registration, recruitment, memberId);
            case REJECTED -> registrationRepository.save(
                    registration.reject(
                            DecisionActor.member(memberId),
                            command.rejectReason(),
                            LocalDateTime.now(clock)
                    )
            );
        };
        events.publishEvent(RegistrationDecidedEvent.from(decidedRegistration));
        return DecideRegistrationResult.from(decidedRegistration);
    }

    private void validateDecisionAuthority(Group group, long memberId) {
        GroupMember leader = groupMemberRepository.findByGroupIdAndMemberId(group.getId(), memberId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.REGISTRATION_ACCESS_DENIED,
                        "가입 신청을 처리할 권한이 없습니다."
                ));
        if (leader.getRole() != GroupMemberRole.LEADER) {
            throw new BusinessException(ErrorCode.REGISTRATION_ACCESS_DENIED, "가입 신청을 처리할 권한이 없습니다.");
        }
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 그룹의 가입 신청은 처리할 수 없습니다.");
        }
    }

    private Registration approveRegistration(
            Registration registration,
            GroupRecruitment recruitment,
            long memberId
    ) {
        long groupId = recruitment.getGroup().getId();
        Member applicant = registration.getMember();
        if (groupMemberRepository.findByGroupIdAndMemberId(groupId, applicant.getId()).isPresent()) {
            throw new BusinessException(ErrorCode.GROUP_MEMBER_ALREADY_EXISTS, "이미 가입한 그룹입니다.");
        }
        int approvedCount = approvedCount(recruitment.getId());
        if (!recruitment.hasCapacity(approvedCount)) {
            throw new BusinessException(ErrorCode.RECRUITMENT_CAPACITY_EXCEEDED, "모집 정원이 모두 찼습니다.");
        }
        LocalDateTime now = LocalDateTime.now(clock);
        Registration approvedRegistration = registrationRepository.save(
                registration.approve(DecisionActor.member(memberId), now, approvedCount)
        );
        registrationRepository.flush();
        groupMemberRepository.save(GroupMember.createMember(recruitment.getGroup(), applicant, now));
        closeRecruitmentIfFull(recruitment, approvedCount + 1, now);
        return approvedRegistration;
    }
}
