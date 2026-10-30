package com.project.jarihana.sparring.command.controller.dto;

import com.project.jarihana.sparring.command.service.dto.SparringCommandResult;

public record SparringCommandResponse(long id) {
    public static SparringCommandResponse from(SparringCommandResult result) {
        return new SparringCommandResponse(result.id());
    }
}
