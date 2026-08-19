package com.project.jarihana.common.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {

    INVALID_PARAMETER(HttpStatus.BAD_REQUEST),
    UNAUTHENTICATED(HttpStatus.UNAUTHORIZED),
    OAUTH_CONFIGURATION_ERROR(HttpStatus.INTERNAL_SERVER_ERROR),
    OAUTH_INVALID_CALLBACK(HttpStatus.BAD_REQUEST),
    OAUTH_STATE_INVALID(HttpStatus.BAD_REQUEST),
    OAUTH_PROVIDER_ERROR(HttpStatus.BAD_GATEWAY),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR);

    private final HttpStatus status;

    ErrorCode(HttpStatus status) {
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }

}
