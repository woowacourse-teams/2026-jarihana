package com.project.jarihana.minigame.command.controller.dto;

import com.project.jarihana.minigame.command.service.dto.CutResult;

public record CutResponse(
        int round,
        int score,
        double errorRate,
        double answerPosition,
        boolean timedOut,
        int totalScore,
        boolean finished
) {

    public static CutResponse from(CutResult result) {
        return new CutResponse(
                result.cut().round(),
                result.cut().score(),
                result.cut().judgement().errorRate(),
                result.cut().judgement().answerPosition(),
                result.cut().timedOut(),
                result.totalScore(),
                result.finished()
        );
    }
}
