package com.project.jarihana.common.response;

import com.project.jarihana.common.exception.ErrorCode;

public record ApiResponse<T>(boolean success, T data, ApiError error) {

    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(true, data, null);
    }

    public static ApiResponse<Void> failure(ErrorCode errorCode, String message) {
        return new ApiResponse<>(false, null, new ApiError(errorCode.name(), message));
    }

    public record ApiError(String code, String message) {
    }
}
