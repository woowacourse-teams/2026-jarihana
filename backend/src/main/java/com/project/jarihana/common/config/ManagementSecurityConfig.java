package com.project.jarihana.common.config;

import org.springframework.boot.security.autoconfigure.actuate.web.servlet.EndpointRequest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.util.matcher.AndRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;

@Configuration(proxyBeanMethods = false)
@Profile({"prod", "dev"})
public class ManagementSecurityConfig {

    @Bean
    @Order(0)
    public SecurityFilterChain managementSecurityFilterChain(HttpSecurity http, Environment environment)
            throws Exception {
        RequestMatcher managementReadRequest = new AndRequestMatcher(
                EndpointRequest.to("health", "prometheus"),
                request -> HttpMethod.GET.matches(request.getMethod())
                        && request.getLocalPort()
                        == environment.getProperty("local.management.port", Integer.class, -1)
        );

        http
                .securityMatcher("/actuator", "/actuator/**")
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers(managementReadRequest).permitAll()
                        .anyRequest().denyAll())
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.FORBIDDEN))
                        .accessDeniedHandler((request, response, exception) ->
                                response.setStatus(HttpStatus.FORBIDDEN.value())));

        return http.build();
    }
}
