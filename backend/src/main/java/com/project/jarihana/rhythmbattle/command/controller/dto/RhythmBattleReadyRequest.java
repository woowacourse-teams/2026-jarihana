package com.project.jarihana.rhythmbattle.command.controller.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * gameNumber는 준비할 다음 판의 번호다. scrollSpeed는 다음 판에서 내 화면의 세균 이동 배속이다.
 */
public record RhythmBattleReadyRequest(@NotNull Boolean ready, @Positive int gameNumber, @NotNull Double scrollSpeed) {
}
