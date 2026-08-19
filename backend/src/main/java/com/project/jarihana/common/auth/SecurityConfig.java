package com.project.jarihana.common.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private static final String[] PUBLIC_PATHS = {"/api/oauth/**"};

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
