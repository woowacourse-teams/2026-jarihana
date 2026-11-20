package com.project.jarihana.minigame.command.controller.dto;

import com.project.jarihana.minigame.domain.ChocolateLevel;
import com.project.jarihana.minigame.domain.StickPuzzle;
import java.util.List;

/**
 * 화면에 그릴 막대다. 정답 위치는 자르기 전에는 내려주지 않는다.
 */
public record StickResponse(
        double lengthCm,
        List<String> cells,
        List<AlmondResponse> almonds,
        double startPosition,
        int totalMilligrams
) {

    public static StickResponse from(StickPuzzle puzzle) {
        if (puzzle == null) {
            return null;
        }
        return new StickResponse(
                StickPuzzle.LENGTH_CM,
                puzzle.cells().stream().map(ChocolateLevel::name).toList(),
                puzzle.almonds().stream()
                        .map(almond -> new AlmondResponse(almond.cell(), almond.size().name()))
                        .toList(),
                puzzle.startPosition(),
                puzzle.totalMilligrams()
        );
    }

    public record AlmondResponse(int cell, String size) {
    }
}
