package com.project.jarihana.gomoku.query.service.dto;

import java.util.UUID;

public record GomokuChatSignalResult(long memberId, UUID participationId, long latestSequence) {}
