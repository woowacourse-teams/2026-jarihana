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
    public void customizeMyAvatar(long memberId, AvatarAppearance appearance) {
        lockMember(memberId);
        avatars.save(MemberAvatar.of(memberId, appearance));
    }

    @Transactional
    public void resetMyAvatar(long memberId) {
        lockMember(memberId);
        avatars.deleteById(memberId);
    }

    // Serialize the first save, replacement and reset for the same member.
    private void lockMember(long memberId) {
        members.findWithLockById(memberId).orElseThrow(() ->
                new BusinessException(ErrorCode.UNAUTHENTICATED, "로그인이 필요합니다."));
    }
}
