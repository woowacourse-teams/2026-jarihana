package com.project.jarihana.rhythmbattle.command.controller.dto;

import jakarta.validation.constraints.Positive;

/**
 * 시작은 다음 판의 번호, 기권은 지금 판의 번호를 보낸다. 판이 바뀐 뒤 늦게 도착한 요청을 가려낸다.
 */
public record RhythmBattleGameRequest(@Positive int gameNumber) {
}
