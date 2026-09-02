package com.project.jarihana.auth.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * GitHub OAuth 연동에 필요한 값을 소유한다. 하나라도 비면 기동 단계에서 멈춘다.
 *
 * <p>{@code clientId}와 {@code clientSecret}은 환경변수 기본값이 빈 문자열이다. 검증이 없으면
 * 환경변수를 넣지 않아도 애플리케이션이 뜨고, 사용자가 로그인을 눌렀을 때 GitHub이 돌려주는
 * 알아보기 힘든 오류로 실패한다. 배포 직후가 아니라 기동 시점에 알아야 한다.
 *
 * <p>세 URI는 그대로 HTTP 요청 대상이 되므로 scheme을 갖춘 절대 주소여야 한다.
 * {@code redirectUri}는 GitHub에 등록한 콜백 주소와 문자열이 정확히 같아야 한다.
 */
@Validated
@ConfigurationProperties(prefix = "jarihana.oauth.github")
public record GithubOAuthProperties(
        @NotBlank
        String clientId,
        @NotBlank
        String clientSecret,
        @NotBlank
        @Pattern(regexp = "^https?://.+")
        String redirectUri,
        @NotBlank
        @Pattern(regexp = "^https?://.+")
        String tokenUri,
        @NotBlank
        @Pattern(regexp = "^https?://.+")
        String userUri
) {
}
