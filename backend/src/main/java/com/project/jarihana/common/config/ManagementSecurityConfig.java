package com.project.jarihana.common.config;

import com.project.jarihana.notificationdelivery.config.WorkerControlApiProperties;
import jakarta.servlet.http.HttpServletRequest;
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

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Configuration(proxyBeanMethods = false)
@Profile({"prod", "dev"})
public class ManagementSecurityConfig {

    @Bean
    @Order(0)
    public SecurityFilterChain managementSecurityFilterChain(HttpSecurity http, Environment environment,
                                                             WorkerControlApiProperties workerControlProperties)
            throws Exception {
        int managementPort = environment.getProperty("local.management.port", Integer.class,
                environment.getProperty("management.server.port", Integer.class, -1));
        RequestMatcher managementReadRequest = new AndRequestMatcher(
                EndpointRequest.to("health", "prometheus"),
                request -> HttpMethod.GET.matches(request.getMethod())
                        && request.getLocalPort() == managementPort
        );
        RequestMatcher workerControlPath = request -> {
            String uri = request.getRequestURI();
            return uri.endsWith("/actuator/workercontrol") || uri.contains("/actuator/workercontrol/");
        };
        RequestMatcher workerControlRequest = new AndRequestMatcher(workerControlPath,
                request -> request.getLocalPort() == managementPort);
        RequestMatcher authenticatedWorkerControlRequest = new AndRequestMatcher(workerControlRequest,
                request -> hasValidMachineToken(request, workerControlProperties.token()));

        http
                .securityMatcher("/actuator", "/actuator/**")
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .csrf(csrf -> csrf.ignoringRequestMatchers(workerControlRequest))
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers(managementReadRequest).permitAll()
                        .requestMatchers(authenticatedWorkerControlRequest).permitAll()
                        .requestMatchers(workerControlRequest).denyAll()
                        .anyRequest().denyAll())
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.FORBIDDEN))
                        .accessDeniedHandler((request, response, exception) ->
                                response.setStatus(HttpStatus.FORBIDDEN.value())));

        return http.build();
    }

    private boolean hasValidMachineToken(HttpServletRequest request, String expectedToken) {
        if (expectedToken == null || expectedToken.getBytes(StandardCharsets.UTF_8).length < 32) {
            return false;
        }
        String providedToken = request.getHeader("X-Jarihana-Worker-Control-Token");
        return providedToken != null && MessageDigest.isEqual(
                expectedToken.getBytes(StandardCharsets.UTF_8), providedToken.getBytes(StandardCharsets.UTF_8));
    }
}
