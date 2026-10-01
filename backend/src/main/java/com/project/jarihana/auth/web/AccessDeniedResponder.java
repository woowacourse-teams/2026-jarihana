package com.project.jarihana.auth.web;

import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.common.logging.RequestLogContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.InvalidCsrfTokenException;
import org.springframework.security.web.csrf.MissingCsrfTokenException;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;

@Component
public class AccessDeniedResponder implements AccessDeniedHandler {

    private static final String MESSAGE = "요청을 수행할 권한이 없습니다.";

    private final ObjectMapper objectMapper;

    public AccessDeniedResponder(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public void handle(
            HttpServletRequest request,
            HttpServletResponse response,
            AccessDeniedException accessDeniedException
    ) throws IOException {
        RequestLogContext.setErrorCode(ErrorCode.ACCESS_DENIED.name());
        String reason = accessDeniedException instanceof MissingCsrfTokenException ? "CSRF_MISSING"
                : accessDeniedException instanceof InvalidCsrfTokenException ? "CSRF_INVALID" : "ACCESS_DENIED";
        RequestLogContext.setAuthenticationFailure(reason);
        SecurityErrorResponder.write(response, objectMapper, ErrorCode.ACCESS_DENIED, MESSAGE);
    }
}
