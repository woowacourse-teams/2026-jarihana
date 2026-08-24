package com.project.jarihana.common.auth;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * 인증 필터가 SecurityContext에 남긴 회원 식별자를 읽는다.
 *
 * <p>인증을 강제하지 않는다. 자격 증명 경로가 여러 개인 엔드포인트는 값이 없을 수 있으므로
 * 존재 여부를 스스로 판단해야 한다.
 */
@Component
public class LoginMemberReader {

    public Optional<Long> currentMemberId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof Long memberId)) {
            return Optional.empty();
        }
        return Optional.of(memberId);
    }
}
