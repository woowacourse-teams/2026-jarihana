package com.project.jarihana.gomoku.command.controller.dto;

import jakarta.validation.constraints.Pattern;

public record GomokuJoinRequest(@Pattern(regexp = "[A-Za-z0-9_-]{43}") String token) {
    @Override
    public String toString() {
        return "GomokuJoinRequest[redacted]";
    }
}
