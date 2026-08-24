package com.project.jarihana.common.auth;

import com.project.jarihana.common.exception.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;

@Component
public class UnauthenticatedEntryPoint implements AuthenticationEntryPoint {

    private static final String MESSAGE = "인증 정보가 필요합니다.";

    private final ObjectMapper objectMapper;

    public UnauthenticatedEntryPoint(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authenticationException
    ) throws IOException {
        SecurityErrorResponder.write(response, objectMapper, ErrorCode.UNAUTHENTICATED, MESSAGE);
    }
}
