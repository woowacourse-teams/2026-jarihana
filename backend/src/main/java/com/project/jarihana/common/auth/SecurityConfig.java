package com.project.jarihana.common.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private static final String[] PUBLIC_PATHS = {"/api/oauth/**"};
    private static final String[] PUBLIC_GET_PATHS = {
            "/api/groups",
            "/api/groups/*",
            "/api/groups/*/members",
            "/api/groups/*/recruitments",
            "/api/groups/*/recruitments/*",
            "/images/**"
    };
    private static final String[] PUBLIC_POST_PATHS = {"/api/auth/refresh"};

    /**
     * 가입 세션과 Access Token 중 하나만 있어도 되는 경로다. 필터는 Access Token만 이해하므로
     * 여기서 통과시키고, 자격 증명이 하나도 없을 때 거부하는 판단은 각 Service가 한다.
     */
    private static final String[] SESSION_OR_TOKEN_GET_PATHS = {"/api/members/me"};
    private static final String[] SESSION_OR_TOKEN_POST_PATHS = {"/api/members", "/api/auth/logout"};

    private final AccessTokenProvider accessTokenProvider;
    private final AuthCookieProperties authCookieProperties;
    private final UnauthenticatedEntryPoint unauthenticatedEntryPoint;
    private final AccessDeniedResponder accessDeniedResponder;

    public SecurityConfig(
            AccessTokenProvider accessTokenProvider,
            AuthCookieProperties authCookieProperties,
            UnauthenticatedEntryPoint unauthenticatedEntryPoint,
            AccessDeniedResponder accessDeniedResponder
    ) {
        this.accessTokenProvider = accessTokenProvider;
        this.authCookieProperties = authCookieProperties;
        this.unauthenticatedEntryPoint = unauthenticatedEntryPoint;
        this.accessDeniedResponder = accessDeniedResponder;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
                .csrf(csrf -> csrf
                        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        .csrfTokenRequestHandler(csrfTokenRequestHandler()))
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers(PUBLIC_PATHS).permitAll()
                        .requestMatchers(HttpMethod.GET, PUBLIC_GET_PATHS).permitAll()
                        .requestMatchers(HttpMethod.POST, PUBLIC_POST_PATHS).permitAll()
                        .requestMatchers(HttpMethod.GET, SESSION_OR_TOKEN_GET_PATHS).permitAll()
                        .requestMatchers(HttpMethod.POST, SESSION_OR_TOKEN_POST_PATHS).permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint(unauthenticatedEntryPoint)
                        .accessDeniedHandler(accessDeniedResponder))
                .addFilterBefore(
                        new JwtCookieAuthenticationFilter(accessTokenProvider, authCookieProperties),
                        UsernamePasswordAuthenticationFilter.class)
                .build();
    }

    /**
     * CSRF 토큰을 지연 생성하지 않고 매 응답에 쿠키로 내린다.
     *
     * <p>기본 설정은 토큰을 읽는 쪽이 있을 때만 발급하는데, JSON API에는 그 지점이 없어
     * 프론트엔드가 토큰을 얻을 방법이 없다.
     */
    private CsrfTokenRequestAttributeHandler csrfTokenRequestHandler() {
        CsrfTokenRequestAttributeHandler handler = new CsrfTokenRequestAttributeHandler();
        handler.setCsrfRequestAttributeName(null);
        return handler;
    }
}
