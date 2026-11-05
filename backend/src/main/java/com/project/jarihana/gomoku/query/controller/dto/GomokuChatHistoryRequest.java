package com.project.jarihana.gomoku.query.controller.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;

public record GomokuChatHistoryRequest(UUID participationId, @Min(1) Long beforeSequence,
        @Min(0) Long afterSequence, @Min(1) @Max(100) Integer size) {
    public int pageSize() {
        return size == null ? 50 : size;
    }

    @AssertTrue
    public boolean isSingleDirection() {
        return beforeSequence == null || afterSequence == null;
    }
}
