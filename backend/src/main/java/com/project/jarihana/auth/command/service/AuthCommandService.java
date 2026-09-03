package com.project.jarihana.auth.command.service;

import com.project.jarihana.auth.command.repository.RefreshTokenRepository;
import com.project.jarihana.auth.command.service.dto.LogoutCommand;
import com.project.jarihana.auth.command.service.dto.RefreshCommand;
import com.project.jarihana.auth.command.service.dto.RefreshResult;
import com.project.jarihana.auth.domain.RefreshToken;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

@Service
public class AuthCommandService {

    private static final String UNAUTHENTICATED_MESSAGE = "인증 정보가 필요합니다.";
    private static final String REFRESH_REQUIRED_MESSAGE = "로그인이 필요합니다.";
    private static final String REFRESH_INVALID_MESSAGE = "다시 로그인해 주세요.";

    private final RefreshTokenRepository refreshTokenRepository;
    private final RefreshTokenHasher refreshTokenHasher;
    private final AccessTokenProvider accessTokenProvider;
    private final Clock clock;

    public AuthCommandService(
            RefreshTokenRepository refreshTokenRepository,
            RefreshTokenHasher refreshTokenHasher,
            AccessTokenProvider accessTokenProvider,
            Clock clock
    ) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.refreshTokenHasher = refreshTokenHasher;
        this.accessTokenProvider = accessTokenProvider;
        this.clock = clock;
    }

    /**
     * 가입 세션만 가진 사용자는 폐기할 Refresh Token이 없으므로, 세션 무효화는 표현 계층이 한다.
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

    /**
     * 회전은 도입하지 않는다. 회전과 재사용 감지는 별도 결정으로 남긴다.
     *
     * <p>유효 기간이 지난 토큰은 거부만 하고 지우지 않는다. 실패 응답과 함께 삭제하려면 예외로
     * 트랜잭션이 되돌아가는 것을 우회해야 하는데, 만료된 토큰은 더 이상 인증에 쓰이지 못하므로
     * 급하지 않다. 정리 방법은 ADR 0001의 후속 작업으로 남아 있다.
     */
    @Transactional
    public RefreshResult refresh(RefreshCommand command) {
        String refreshTokenValue = requireRefreshToken(command.refreshTokenValue());
        RefreshToken refreshToken = refreshTokenRepository
                .findByTokenHash(refreshTokenHasher.hash(refreshTokenValue))
                .orElseThrow(() -> new BusinessException(ErrorCode.REFRESH_TOKEN_INVALID, REFRESH_INVALID_MESSAGE));
        if (refreshToken.isExpired(LocalDateTime.now(clock))) {
            throw new BusinessException(ErrorCode.REFRESH_TOKEN_INVALID, REFRESH_INVALID_MESSAGE);
        }
        return new RefreshResult(accessTokenProvider.issue(refreshToken.getMember().getId()));
    }

    private String requireRefreshToken(String refreshTokenValue) {
        if (refreshTokenValue == null || refreshTokenValue.isBlank()) {
            throw new BusinessException(ErrorCode.REFRESH_TOKEN_REQUIRED, REFRESH_REQUIRED_MESSAGE);
        }
        return refreshTokenValue;
    }
}
