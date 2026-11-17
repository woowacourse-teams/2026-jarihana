package com.project.jarihana.rhythmbattle.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

/**
 * 오래 활동이 없어 요청 도중 방을 닫았다. 닫은 결과는 저장하고 요청만 거절한다.
 */
public class RhythmBattleRoomClosedException extends BusinessException {
    public RhythmBattleRoomClosedException() {
        super(ErrorCode.RHYTHM_BATTLE_CONFLICT, "오래 활동이 없어 방이 닫혔어요.");
    }
}
