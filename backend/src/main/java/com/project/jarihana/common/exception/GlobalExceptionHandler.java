package com.project.jarihana.common.exception;

import com.project.jarihana.common.response.ApiResponse;
import org.hibernate.exception.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.Set;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    private static final Set<String> MEMBER_NAME_CONSTRAINTS = Set.of(
            "uk_member_crew_name_generation",
            "uk_member_coach_name",
            "uk_member_name_scope"
    );

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException exception) {
        ErrorCode errorCode = exception.getErrorCode();
        log.warn("비즈니스 예외가 발생했습니다. code={}", errorCode.name());
        return toResponse(errorCode, exception.getMessage());
    }

    private ResponseEntity<ApiResponse<Void>> toResponse(ErrorCode errorCode, String message) {
        return ResponseEntity.status(errorCode.getStatus())
                .body(ApiResponse.failure(errorCode, message));
    }

    @ExceptionHandler({
            BindException.class,
            HttpMessageNotReadableException.class,
            IllegalArgumentException.class,
            MethodArgumentNotValidException.class,
            MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class
    })
    public ResponseEntity<ApiResponse<Void>> handleInvalidRequest(Exception exception) {
        log.warn("잘못된 요청입니다. type={}", exception.getClass().getSimpleName());
        return toResponse(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleDataIntegrityViolation(DataIntegrityViolationException exception) {
        if (isMemberNameConflict(exception)) {
            log.warn("회원 이름 중복 제약에 위배되었습니다.");
            return toResponse(ErrorCode.MEMBER_CREW_DUPLICATED, "이미 사용 중인 크루명입니다.");
        }
        return handleUnexpectedException(exception);
    }

    private boolean isMemberNameConflict(DataIntegrityViolationException exception) {
        Throwable cause = exception;
        while (cause != null) {
            if (cause instanceof ConstraintViolationException violation
                    && MEMBER_NAME_CONSTRAINTS.contains(violation.getConstraintName())) {
                return true;
            }
            cause = cause.getCause();
        }
        return false;
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpectedException(Exception exception) {
        log.error("처리하지 못한 예외가 발생했습니다.", exception);
        return toResponse(ErrorCode.INTERNAL_ERROR, "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
}
