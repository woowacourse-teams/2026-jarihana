package com.project.jarihana.member.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberAvatarRepository;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.AvatarAppearance;
import com.project.jarihana.member.domain.MemberAvatar;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class MemberAvatarCommandService {
    private final MemberAvatarRepository avatars;
    private final MemberRepository members;

    @Transactional
    public void customizeMyAvatar(long memberId, long expectedMemberId, AvatarAppearance appearance) {
        requireMatchingAccount(memberId, expectedMemberId);
        lockMember(memberId);
        avatars.save(MemberAvatar.of(memberId, appearance));
    }

    @Transactional
    public void resetMyAvatar(long memberId, long expectedMemberId) {
        requireMatchingAccount(memberId, expectedMemberId);
        lockMember(memberId);
        avatars.deleteById(memberId);
    }

    private void requireMatchingAccount(long memberId, long expectedMemberId) {
        if (expectedMemberId <= 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "편집을 시작한 회원 ID가 올바르지 않습니다.");
        }
        if (memberId != expectedMemberId) {
            throw new BusinessException(ErrorCode.ACCOUNT_CHANGED, "편집을 시작한 계정과 현재 로그인 계정이 달라요.");
        }
    }

    // Serialize the first save, replacement and reset for the same member.
    private void lockMember(long memberId) {
        members.findWithLockById(memberId).orElseThrow(() ->
                new BusinessException(ErrorCode.UNAUTHENTICATED, "로그인이 필요합니다."));
    }
}
