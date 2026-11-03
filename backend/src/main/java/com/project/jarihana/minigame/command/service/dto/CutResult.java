package com.project.jarihana.minigame.command.service.dto;

import com.project.jarihana.minigame.domain.RoundCut;
import com.project.jarihana.minigame.domain.StickPuzzle;

/**
 * 막대를 자른 결과와 판 전체의 진행 상태다. 판이 끝나면 다음 막대는 없다.
 */
public record CutResult(RoundCut cut, int totalScore, boolean finished, StickPuzzle nextStick) {
}
