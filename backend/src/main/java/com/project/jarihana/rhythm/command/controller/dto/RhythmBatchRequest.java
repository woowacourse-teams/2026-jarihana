package com.project.jarihana.rhythm.command.controller.dto;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.rhythm.command.service.dto.RhythmBatchCommand;
import com.project.jarihana.rhythm.domain.RhythmInput;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 입력 시각과 진행 시각은 곡 시작 기준 초이며 클라이언트의 입력 지연 보정을 적용한 값이다.
 * 방향은 left, down, right, up 순서의 순번이다.
 */
public record RhythmBatchRequest(
        @Positive int sequence,
        @NotNull Double playedUntil,
        @NotNull @Size(max = 400) List<@Valid @NotNull Input> inputs,
        boolean finished
) {
    public RhythmBatchCommand toCommand() {
        // 아주 큰 지수 표기는 무한대로 읽히므로 계산 전에 거절한다.
        if (!Double.isFinite(playedUntil) || inputs.stream().anyMatch(input -> !Double.isFinite(input.at()))) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "시각 값이 올바르지 않아요.");
        }
        return new RhythmBatchCommand(sequence, playedUntil,
                inputs.stream().map(input -> RhythmInput.of(input.lane(), input.at())).toList(), finished);
    }

    public record Input(@NotNull @Min(0) @Max(3) Integer lane, @NotNull Double at) {
    }
}
