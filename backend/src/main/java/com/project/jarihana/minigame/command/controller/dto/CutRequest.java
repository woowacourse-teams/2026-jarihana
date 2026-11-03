package com.project.jarihana.minigame.command.controller.dto;

import com.project.jarihana.minigame.command.service.dto.CutCommand;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * 자른 위치는 막대 왼쪽 끝부터 잰 cm다.
 */
public record CutRequest(
        @Positive(message = "자를 막대 번호를 다시 확인해 주세요.")
        int round,

        @NotNull(message = "자른 위치를 보내 주세요.")
        @DecimalMin(value = "0.0", message = "자른 위치가 막대 밖입니다.")
        @DecimalMax(value = "12.0", message = "자른 위치가 막대 밖입니다.")
        Double position
) {

    public CutCommand toCommand(long memberId, long runId) {
        return new CutCommand(memberId, runId, round, position);
    }
}
