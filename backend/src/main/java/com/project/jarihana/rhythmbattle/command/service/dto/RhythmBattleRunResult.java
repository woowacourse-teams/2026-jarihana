package com.project.jarihana.rhythmbattle.command.service.dto;

import com.project.jarihana.rhythmbattle.domain.RhythmBattleRoom;
import com.project.jarihana.rhythmbattle.domain.RhythmBattleRun;

/**
 * 입력 묶음이나 기권을 처리한 뒤 내 판과 방의 상태다. 판이 끝났으면 방에 승자와 이유가 있다.
 */
public record RhythmBattleRunResult(RhythmBattleRun run, RhythmBattleRoom room) {
}
