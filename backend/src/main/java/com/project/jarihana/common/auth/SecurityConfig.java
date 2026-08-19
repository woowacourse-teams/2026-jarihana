package com.project.jarihana.common.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private static final String[] PUBLIC_PATHS = {"/api/oauth/**"};
    private static final String[] PUBLIC_GET_PATHS = {
            "/api/groups",
            "/api/groups/*",
            "/api/groups/*/members",
            "/api/groups/*/recruitments",
            "/api/groups/*/recruitments/*"
    };
    private static final String[] PUBLIC_POST_PATHS = {"/api/auth/refresh"};

    /**
     * 가입 세션과 Access Token 중 하나만 있어도 되는 경로다. 필터는 Access Token만 이해하므로
     * 여기서 통과시키고, 자격 증명이 하나도 없을 때 거부하는 판단은 각 Service가 한다.
     */
    private static final String[] SESSION_OR_TOKEN_GET_PATHS = {"/api/members/me"};

    private final AccessTokenProvider accessTokenProvider;
    private final JwtProperties jwtProperties;
    private final UnauthenticatedEntryPoint unauthenticatedEntryPoint;
    private final AccessDeniedResponder accessDeniedResponder;

    public SecurityConfig(
            AccessTokenProvider accessTokenProvider,
            JwtProperties jwtProperties,
            UnauthenticatedEntryPoint unauthenticatedEntryPoint,
            AccessDeniedResponder accessDeniedResponder
    ) {
        this.accessTokenProvider = accessTokenProvider;
        this.jwtProperties = jwtProperties;
        this.unauthenticatedEntryPoint = unauthenticatedEntryPoint;
        this.accessDeniedResponder = accessDeniedResponder;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers(PUBLIC_PATHS).permitAll()
                        .requestMatchers(HttpMethod.GET, PUBLIC_GET_PATHS).permitAll()
                        .requestMatchers(HttpMethod.POST, PUBLIC_POST_PATHS).permitAll()
                        .requestMatchers(HttpMethod.GET, SESSION_OR_TOKEN_GET_PATHS).permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint(unauthenticatedEntryPoint)
                        .accessDeniedHandler(accessDeniedResponder))
                .addFilterBefore(
                        new JwtCookieAuthenticationFilter(accessTokenProvider, jwtProperties),
                        UsernamePasswordAuthenticationFilter.class)
                .build();
    }
}
