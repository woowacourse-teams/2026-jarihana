package com.project.jarihana.minigame.domain;

/**
 * 한 번 자른 결과다. 오차는 양쪽 무게 차이를 전체 무게로 나눈 값이다.
 */
public record CutJudgement(double errorRate, int score, double answerPosition) {
}
