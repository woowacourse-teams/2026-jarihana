package com.project.jarihana.common.exception;

import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.common.logging.RequestLogContext;
import com.project.jarihana.common.logging.SafeExceptionLogFields;
import io.sentry.Sentry;
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
import java.util.List;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    private static final Set<String> MEMBER_NAME_CONSTRAINTS = Set.of(
            "uk_member_crew_name_generation",
            "uk_member_coach_name"
    );

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException exception) {
        ErrorCode errorCode = exception.getErrorCode();
        recordFailure(errorCode, exception);
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
        if (exception instanceof BindException binding) {
            RequestLogContext.setInvalidFields(binding.getBindingResult().getFieldErrors().stream()
                    .map(error -> error.getField()).toList());
        } else if (exception instanceof MethodArgumentTypeMismatchException mismatch) {
            RequestLogContext.setInvalidFields(List.of(mismatch.getName()));
        } else if (exception instanceof MissingServletRequestParameterException missing) {
            RequestLogContext.setInvalidFields(List.of(missing.getParameterName()));
        }
        recordFailure(ErrorCode.INVALID_PARAMETER, exception);
        return toResponse(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleDataIntegrityViolation(DataIntegrityViolationException exception) {
        if (isMemberNameConflict(exception)) {
            recordFailure(ErrorCode.MEMBER_CREW_DUPLICATED, exception);
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
        recordFailure(ErrorCode.INTERNAL_ERROR, exception);
        return toResponse(ErrorCode.INTERNAL_ERROR, "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }

    private void recordFailure(ErrorCode errorCode, Throwable exception) {
        RequestLogContext.setErrorCode(errorCode.name());
        if (errorCode == ErrorCode.UNAUTHENTICATED) {
            RequestLogContext.setAuthenticationFailureIfAbsent("AUTHENTICATION_REJECTED");
        }
        var event = errorCode == ErrorCode.INTERNAL_ERROR ? log.atError() : log.atWarn();
        event.addKeyValue("event.action", "application.error")
                .addKeyValue("event.category", List.of("web"))
                .addKeyValue("event.type", List.of("error"))
                .addKeyValue("event.outcome", "failure")
                .addKeyValue("jarihana.error_code", errorCode.name());
        if (errorCode == ErrorCode.INTERNAL_ERROR) {
            SafeExceptionLogFields.from(exception).forEach(event::addKeyValue);
            Sentry.captureException(exception);
        } else {
            event.addKeyValue("error.type", exception.getClass().getName());
        }
        event.log("Application request failed");
    }
}
