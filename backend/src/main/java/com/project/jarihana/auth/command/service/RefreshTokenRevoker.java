package com.project.jarihana.auth.command.service;

import com.project.jarihana.auth.command.repository.RefreshTokenFamilyRepository;
import com.project.jarihana.auth.command.repository.RefreshTokenRepository;
import com.project.jarihana.auth.domain.RefreshTokenRevokeReason;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 패밀리를 폐기하면 사유를 남기고 그 패밀리의 토큰을 모두 지운다. 지우는 사이 회전으로 새 토큰이 끼어들어도
 * 패밀리가 폐기되어 있어 쓰이지 않는다.
 *
 * <p>재사용 감지는 거절 예외를 던지는 갱신 트랜잭션 안에서 일어난다. 같은 트랜잭션에서 폐기하면 예외와 함께
 * 되돌아가 최신 토큰이 살아남으므로, 별도 빈의 새 트랜잭션에서 커밋한다. 같은 클래스 안에서 부르면 프록시를
 * 거치지 않아 {@code REQUIRES_NEW}가 적용되지 않는다.
 */
@Service
@RequiredArgsConstructor
public class RefreshTokenRevoker {

    private final RefreshTokenFamilyRepository refreshTokenFamilyRepository;
    private final RefreshTokenRepository refreshTokenRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void revokeOnReuse(long familyId, LocalDateTime now) {
        revoke(familyId, RefreshTokenRevokeReason.REUSE_DETECTED, now);
    }

    /**
     * 로그아웃은 구독 해제와 함께 되돌아가야 하므로 호출한 트랜잭션에 참여한다.
     */
    @Transactional
    public void revokeOnLogout(long familyId, LocalDateTime now) {
        revoke(familyId, RefreshTokenRevokeReason.LOGOUT, now);
    }

    private void revoke(long familyId, RefreshTokenRevokeReason reason, LocalDateTime now) {
        refreshTokenFamilyRepository.revoke(familyId, reason, now);
        refreshTokenRepository.removeAllByFamilyId(familyId);
    }
}
