package com.project.jarihana.gomoku.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

public class GomokuRoomExpiredException extends BusinessException {
    public GomokuRoomExpiredException() {
        super(ErrorCode.GOMOKU_CONFLICT, "제한 시간이 끝났어요. 최신 판을 확인해 주세요.");
    }
}
