package com.project.jarihana.member.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.query.repository.MemberAvatarQueryRepository;
import com.project.jarihana.member.query.repository.MemberQueryRepository;
import com.project.jarihana.member.query.service.dto.MemberAvatarResult;
import com.project.jarihana.member.domain.AvatarAppearance;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class MemberAvatarQueryService {
    private final MemberAvatarQueryRepository avatars;
    private final MemberQueryRepository members;

    public MemberAvatarResult findMyAvatar(long memberId) {
        if (members.findProfileById(memberId).isEmpty()) {
            throw new BusinessException(ErrorCode.UNAUTHENTICATED, "로그인이 필요합니다.");
        }
        return avatars.findAppearanceByMemberId(memberId)
                .map(value -> new MemberAvatarResult(true, value))
                .orElseGet(() -> new MemberAvatarResult(false, AvatarAppearance.basic()));
    }
}
