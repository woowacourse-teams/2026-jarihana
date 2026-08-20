package com.project.jarihana.auth.command.service;

import com.project.jarihana.auth.command.repository.RefreshTokenRepository;
import com.project.jarihana.auth.command.service.dto.LogoutCommand;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthCommandService {

    private static final String UNAUTHENTICATED_MESSAGE = "인증 정보가 필요합니다.";

    private final RefreshTokenRepository refreshTokenRepository;
    private final RefreshTokenHasher refreshTokenHasher;

    public AuthCommandService(
            RefreshTokenRepository refreshTokenRepository,
            RefreshTokenHasher refreshTokenHasher
    ) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.refreshTokenHasher = refreshTokenHasher;
    }

    /**
     * 자격 증명 종류에 따라 무효화 대상이 다르다.
     *
     * <p>가입을 마친 회원은 Refresh Token을 폐기하고, GitHub 인증만 끝낸 사용자는 가입 세션만
     * 가지고 있으므로 표현 계층이 세션을 무효화한다. 어느 쪽도 없으면 로그아웃할 대상이 없다.
     *
     * <p>저장소에 없는 Refresh Token은 이미 폐기됐거나 위조된 값이므로 자격 증명으로 세지 않는다.
     */
    @Transactional
    public void logout(LogoutCommand command) {
        boolean discarded = discardRefreshToken(command.refreshTokenValue());
        if (!discarded && command.memberId() == null && command.signupGithubId() == null) {
            throw new BusinessException(ErrorCode.UNAUTHENTICATED, UNAUTHENTICATED_MESSAGE);
        }
    }

    private boolean discardRefreshToken(String refreshTokenValue) {
        if (refreshTokenValue == null || refreshTokenValue.isBlank()) {
            return false;
        }
        return refreshTokenRepository.findByTokenHash(refreshTokenHasher.hash(refreshTokenValue))
                .map(refreshToken -> {
                    refreshTokenRepository.delete(refreshToken);
                    return true;
                })
                .orElse(false);
    }
}
