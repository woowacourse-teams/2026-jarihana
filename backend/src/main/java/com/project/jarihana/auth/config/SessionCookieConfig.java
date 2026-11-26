package com.project.jarihana.auth.config;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.session.autoconfigure.DefaultCookieSerializerCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 가입 세션 쿠키({@code SESSION})의 Secure를 자격 증명 쿠키와 같은 설정으로 정한다.
 *
 * <p>정하지 않으면 Spring Session은 요청의 {@code isSecure()}를 따른다. 운영 백엔드는 앞단이 HTTPS를
 * 끝낸 뒤 HTTP로 요청을 받으므로 그 값이 항상 거짓이라, 가입 전 사용자의 githubId를 가리키는 세션
 * 쿠키가 Secure 없이 나간다.
 */
@Configuration
@RequiredArgsConstructor
public class SessionCookieConfig {

    private final AuthCookieProperties authCookieProperties;

    @Bean
    public DefaultCookieSerializerCustomizer secureSessionCookie() {
        return serializer -> serializer.setUseSecureCookie(authCookieProperties.secure());
    }
}
