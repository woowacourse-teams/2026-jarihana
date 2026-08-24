package com.project.jarihana.common.auth;

import com.project.jarihana.common.exception.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
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
        SecurityErrorResponder.write(response, objectMapper, ErrorCode.ACCESS_DENIED, MESSAGE);
    }
}
