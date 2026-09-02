package com.project.jarihana.registration.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.registration.command.repository.RegistrationCommandRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class RegistrationReadCommandService {

    private final GroupCommandRepository groupRepository;
    private final GroupMemberCommandRepository groupMemberRepository;
    private final RegistrationCommandRepository registrationRepository;
    private final Clock clock;

    @Transactional
    public void markRegistrationsRead(long memberId, long recruitmentId, long throughRegistrationId) {
        Group group = groupRepository.findWithLockByRecruitmentId(recruitmentId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.RECRUITMENT_NOT_FOUND,
                        "모집 공고를 찾을 수 없습니다."
                ));
        validateReadAuthority(group, memberId);
        LocalDateTime now = LocalDateTime.now(clock);
        registrationRepository
                .findAllByRecruitmentIdAndIdLessThanEqualAndLeaderViewedAtIsNull(
                        recruitmentId,
                        throughRegistrationId
                )
                .stream()
                .map(registration -> registration.viewByLeader(now))
                .forEach(registrationRepository::save);
    }

    private void validateReadAuthority(Group group, long memberId) {
        GroupMember leader = groupMemberRepository.findByGroupIdAndMemberId(group.getId(), memberId)
                .orElseThrow(() -> accessDenied());
        if (leader.getRole() != GroupMemberRole.LEADER) {
            throw accessDenied();
        }
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 그룹의 신청은 확인 처리할 수 없습니다.");
        }
    }

    private static BusinessException accessDenied() {
        return new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, "현재 모임장만 신청을 확인 처리할 수 있습니다.");
    }
}
