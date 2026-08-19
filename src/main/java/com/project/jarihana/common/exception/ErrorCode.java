package com.project.jarihana.common.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {

    INVALID_PARAMETER(HttpStatus.BAD_REQUEST, "요청 값이 올바르지 않습니다."),
    UNAUTHENTICATED(HttpStatus.UNAUTHORIZED, "인증 정보가 없거나 만료되었습니다."),
    OAUTH_INVALID_CALLBACK(HttpStatus.BAD_REQUEST, "GitHub 인증 요청이 올바르지 않습니다. 다시 시도해 주세요."),
    OAUTH_STATE_INVALID(HttpStatus.BAD_REQUEST, "GitHub 인증 요청을 확인하지 못했습니다. 다시 시도해 주세요."),
    OAUTH_PROVIDER_ERROR(HttpStatus.BAD_GATEWAY, "GitHub 사용자 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요."),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");

    private final HttpStatus status;
    private final String message;

    ErrorCode(HttpStatus status, String message) {
        this.status = status;
        this.message = message;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getMessage() {
        return message;
    }
}
