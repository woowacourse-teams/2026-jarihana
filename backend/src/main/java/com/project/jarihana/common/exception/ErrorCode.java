package com.project.jarihana.common.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {

    INVALID_PARAMETER(HttpStatus.BAD_REQUEST),
    UNAUTHENTICATED(HttpStatus.UNAUTHORIZED),
    ACCESS_DENIED(HttpStatus.FORBIDDEN),
    SIGNUP_SESSION_REQUIRED(HttpStatus.UNAUTHORIZED),
    MEMBER_ALREADY_EXISTS(HttpStatus.CONFLICT),
    MEMBER_CREW_DUPLICATED(HttpStatus.CONFLICT),
    GROUP_NOT_FOUND(HttpStatus.NOT_FOUND),
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
