package com.project.jarihana.auth.command.service;

import com.project.jarihana.auth.command.repository.RefreshTokenRepository;
import com.project.jarihana.auth.command.service.dto.LogoutCommand;
import com.project.jarihana.auth.command.service.dto.RefreshCommand;
import com.project.jarihana.auth.command.service.dto.RefreshResult;
import com.project.jarihana.auth.config.AuthProperties;
import com.project.jarihana.auth.domain.RefreshToken;
import com.project.jarihana.auth.domain.RefreshTokenFamily;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.pushsubscription.command.service.PushSubscriptionCommandService;
import com.project.jarihana.pushsubscription.command.service.dto.DisconnectPushSubscriptionCommand;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;

@Service
public class AuthCommandService {

    private static final Logger log = LoggerFactory.getLogger(AuthCommandService.class);

    private static final String UNAUTHENTICATED_MESSAGE = "인증 정보가 필요합니다.";
    private static final String REFRESH_REQUIRED_MESSAGE = "로그인이 필요합니다.";
    private static final String REFRESH_INVALID_MESSAGE = "다시 로그인해 주세요.";

    private final RefreshTokenRepository refreshTokenRepository;
    private final RefreshTokenHasher refreshTokenHasher;
    private final RefreshTokenIssuer refreshTokenIssuer;
    private final RefreshTokenRevoker refreshTokenRevoker;
    private final AccessTokenProvider accessTokenProvider;
    private final AuthProperties authProperties;
    private final Clock clock;
    private final PushSubscriptionCommandService subscriptions;

    public AuthCommandService(
            RefreshTokenRepository refreshTokenRepository,
            RefreshTokenHasher refreshTokenHasher,
            RefreshTokenIssuer refreshTokenIssuer,
            RefreshTokenRevoker refreshTokenRevoker,
            AccessTokenProvider accessTokenProvider,
            AuthProperties authProperties,
            Clock clock,
            PushSubscriptionCommandService subscriptions
    ) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.refreshTokenHasher = refreshTokenHasher;
        this.refreshTokenIssuer = refreshTokenIssuer;
        this.refreshTokenRevoker = refreshTokenRevoker;
        this.accessTokenProvider = accessTokenProvider;
        this.authProperties = authProperties;
        this.clock = clock;
        this.subscriptions = subscriptions;
    }

    /**
     * 가입 세션만 가진 사용자는 폐기할 Refresh Token이 없으므로, 세션 무효화는 표현 계층이 한다.
     *
     * <p>저장소에 없는 Refresh Token은 이미 폐기됐거나 위조된 값이므로 자격 증명으로 세지 않는다.
     */
    @Transactional
    public void logout(LogoutCommand command) {
        logout(command, null);
    }

    @Transactional
    public void logout(LogoutCommand command, DisconnectPushSubscriptionCommand binding) {
        Optional<RefreshToken> refresh = findRefreshToken(command.refreshTokenValue());
        if (refresh.isEmpty() && command.memberId() == null && command.signupGithubId() == null) {
            throw new BusinessException(ErrorCode.UNAUTHENTICATED, UNAUTHENTICATED_MESSAGE);
        }
        if (binding != null) {
            Long memberId = command.memberId() != null ? command.memberId() : refresh.map(token -> token.getMember().getId()).orElse(null);
            if (memberId == null || (command.memberId() != null && refresh.isPresent()
                    && !command.memberId().equals(refresh.get().getMember().getId()))) {
                throw new BusinessException(ErrorCode.UNAUTHENTICATED, "인증 정보가 일치하지 않습니다.");
            }
            subscriptions.disconnectSubscription(memberId, binding.subscriptionId(), binding.generation());
        }
        refresh.ifPresent(this::discard);
    }

    private Optional<RefreshToken> findRefreshToken(String refreshTokenValue) {
        if (refreshTokenValue == null || refreshTokenValue.isBlank()) {
            return Optional.empty();
        }
        return refreshTokenRepository.findByTokenHash(refreshTokenHasher.hash(refreshTokenValue));
    }

    /**
     * 패밀리가 있으면 회전된 이전 토큰까지 같은 로그인 전체를 폐기한다. 패밀리 없이 저장된 이전 행은 그 행만
     * 지운다.
     */
    private void discard(RefreshToken refreshToken) {
        Optional<RefreshTokenFamily> family = refreshToken.findFamily();
        if (family.isEmpty()) {
            refreshTokenRepository.delete(refreshToken);
            return;
        }
        refreshTokenRevoker.revokeOnLogout(family.get().getId(), LocalDateTime.now(clock));
    }

    /**
     * 갱신할 때마다 Refresh Token을 회전하고, 회전된 토큰이 유예 시간 뒤에 다시 오면 같은 사본이 두 곳에
     * 있다는 증거로 보고 그 로그인을 폐기한다. 판정 순서는 백엔드 ADR 0031을 따른다.
     *
     * <p>회전 여부는 만료보다 먼저 본다. 회전한 토큰은 이전 버전 롤백에 대비해 만료를 유예 끝으로 당겨 두므로,
     * 만료를 먼저 보면 재사용이 단순 만료로 처리되어 폐기가 일어나지 않는다.
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
                .orElseThrow(this::invalidRefreshToken);
        LocalDateTime now = LocalDateTime.now(clock);
        long memberId = refreshToken.getMember().getId();
        if (!refreshToken.isFamilyUsableAt(now)) {
            throw invalidRefreshToken();
        }
        if (refreshToken.isRotated()) {
            return reissueAfterRotation(refreshToken, memberId, now);
        }
        if (refreshToken.isExpired(now)) {
            throw invalidRefreshToken();
        }
        return rotate(refreshToken, memberId, now);
    }

    private RefreshResult rotate(RefreshToken refreshToken, long memberId, LocalDateTime now) {
        LocalDateTime originalExpiresAt = refreshToken.getExpiresAt();
        LocalDateTime replayableUntil = now.plus(authProperties.refreshTokenReuseGrace());
        if (refreshTokenRepository.markRotated(refreshToken.getId(), now, replayableUntil) == 0) {
            return reissueAfterConcurrentRotation(refreshToken.getId(), memberId);
        }
        RefreshTokenFamily family = refreshToken.findFamily()
                .orElseGet(() -> refreshTokenIssuer.adoptIntoNewFamily(refreshToken, originalExpiresAt, now));
        return RefreshResult.rotated(accessTokenProvider.issue(memberId), refreshTokenIssuer.issueInto(family, now));
    }

    /**
     * 회전 UPDATE가 0행이면 같은 토큰으로 온 다른 요청이 방금 회전했거나, 그사이 로그아웃이나 재사용 폐기로
     * 행이 지워졌다. 회전된 행이 남아 있을 때만 유예 안의 재제출과 같이 Access Token을 발급한다.
     */
    private RefreshResult reissueAfterConcurrentRotation(long refreshTokenId, long memberId) {
        if (!refreshTokenRepository.existsByIdAndRotatedAtIsNotNull(refreshTokenId)) {
            throw invalidRefreshToken();
        }
        log.info("같은 Refresh Token으로 온 다른 요청이 방금 회전해 Access Token만 발급했습니다. memberId={}", memberId);
        return RefreshResult.accessTokenOnly(accessTokenProvider.issue(memberId));
    }

    private RefreshResult reissueAfterRotation(RefreshToken refreshToken, long memberId, LocalDateTime now) {
        long sinceRotationMs = Duration.between(refreshToken.getRotatedAt(), now).toMillis();
        if (refreshToken.isWithinReuseGraceAt(now, authProperties.refreshTokenReuseGrace())) {
            log.info("회전 직후 같은 Refresh Token이 다시 와 Access Token만 발급했습니다. memberId={}, sinceRotationMs={}",
                    memberId, sinceRotationMs);
            return RefreshResult.accessTokenOnly(accessTokenProvider.issue(memberId));
        }
        RefreshTokenFamily family = refreshToken.findFamily().orElseThrow(this::invalidRefreshToken);
        refreshTokenRevoker.revokeOnReuse(family.getId(), now);
        log.warn("회전된 Refresh Token의 재사용을 감지해 로그인을 폐기했습니다. familyId={}, memberId={}, sinceRotationMs={}",
                family.getId(), memberId, sinceRotationMs);
        throw invalidRefreshToken();
    }

    private BusinessException invalidRefreshToken() {
        return new BusinessException(ErrorCode.REFRESH_TOKEN_INVALID, REFRESH_INVALID_MESSAGE);
    }

    private String requireRefreshToken(String refreshTokenValue) {
        if (refreshTokenValue == null || refreshTokenValue.isBlank()) {
            throw new BusinessException(ErrorCode.REFRESH_TOKEN_REQUIRED, REFRESH_REQUIRED_MESSAGE);
        }
        return refreshTokenValue;
    }
}
