package com.project.jarihana.gomoku.query.controller.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

public record GomokuHistoryListRequest(@Size(max = 256) String cursor, @Min(1) @Max(100) Integer size) {
    public GomokuHistoryListRequest { if (size == null) size = 20; }
}
