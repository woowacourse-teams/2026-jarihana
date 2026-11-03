package com.project.jarihana.gomoku.query.controller.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

public record GomokuListRequest(
        @Size(max = 256) String cursor,
        @Min(1) @Max(100) Integer size,
        @Size(max = 50) String keyword) {
    public GomokuListRequest {
        if (size == null) size = 20;
    }
}
