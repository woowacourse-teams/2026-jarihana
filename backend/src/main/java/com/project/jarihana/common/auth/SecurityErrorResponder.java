package com.project.jarihana.common.auth;

import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.common.response.ApiResponse;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.http.MediaType;
import tools.jackson.databind.ObjectMapper;

/**
 * 필터 단계에서 발생한 인증과 인가 실패를 공통 오류 응답으로 쓴다.
 *
 * <p>필터는 GlobalExceptionHandler보다 앞에서 동작해 예외 변환을 거치지 않으므로
 * 같은 응답 형식을 이곳에서 직접 만든다.
 */
final class SecurityErrorResponder {

    private SecurityErrorResponder() {
    }

    static void write(
            HttpServletResponse response,
            ObjectMapper objectMapper,
            ErrorCode errorCode,
            String message
    ) throws IOException {
        response.setStatus(errorCode.getStatus().value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(response.getWriter(), ApiResponse.failure(errorCode, message));
    }
}
