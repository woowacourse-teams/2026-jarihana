package com.project.jarihana.common.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {

    INVALID_PARAMETER(HttpStatus.BAD_REQUEST),
    UNAUTHENTICATED(HttpStatus.UNAUTHORIZED),
    MEMBER_NOT_FOUND(HttpStatus.NOT_FOUND),
    GROUP_NAME_DUPLICATED(HttpStatus.CONFLICT),
    GROUP_ACCESS_DENIED(HttpStatus.FORBIDDEN),
    GROUP_ENDED(HttpStatus.CONFLICT),
    GROUP_DELETE_WINDOW_EXPIRED(HttpStatus.CONFLICT),
    GROUP_TERMINATION_NOT_AVAILABLE(HttpStatus.CONFLICT),
    GROUP_ALREADY_ENDED(HttpStatus.CONFLICT),
    IMAGE_NOT_FOUND(HttpStatus.BAD_REQUEST),
    SCHEDULE_TYPE_MISMATCH(HttpStatus.CONFLICT),
    SCHEDULE_REQUIRED(HttpStatus.BAD_REQUEST),
    SCHEDULE_INVALID_RULE(HttpStatus.BAD_REQUEST),
    RECURRING_SCHEDULE_NOT_FOUND(HttpStatus.NOT_FOUND),
    ACCESS_DENIED(HttpStatus.FORBIDDEN),
    SIGNUP_SESSION_REQUIRED(HttpStatus.UNAUTHORIZED),
    REFRESH_TOKEN_REQUIRED(HttpStatus.UNAUTHORIZED),
    REFRESH_TOKEN_INVALID(HttpStatus.UNAUTHORIZED),
    MEMBER_ALREADY_EXISTS(HttpStatus.CONFLICT),
    MEMBER_CREW_DUPLICATED(HttpStatus.CONFLICT),
    GROUP_NOT_FOUND(HttpStatus.NOT_FOUND),
    RECRUITMENT_NOT_FOUND(HttpStatus.NOT_FOUND),
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
