package com.project.jarihana.minigame.command.service.dto;

import com.project.jarihana.minigame.domain.RoundCut;

/**
 * 막대를 자른 결과와 판 전체의 진행 상태다. 다음 막대는 회원이 결과를 본 뒤 따로 받는다.
 */
public record CutResult(RoundCut cut, int totalScore, boolean finished) {
}
