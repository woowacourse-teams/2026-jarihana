package com.project.jarihana.gomoku.command.service.dto;

import java.util.UUID;

public record GomokuMoveCommand(int gameNumber, int expectedPly, int x, int y, UUID requestId) {}
