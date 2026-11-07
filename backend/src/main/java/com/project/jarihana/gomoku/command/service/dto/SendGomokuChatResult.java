package com.project.jarihana.gomoku.command.service.dto;

import com.project.jarihana.gomoku.domain.GomokuChatMessage;

public record SendGomokuChatResult(GomokuChatMessage message, boolean created) {}
