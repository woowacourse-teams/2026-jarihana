package com.project.jarihana.rhythm.command.service.dto;

import com.project.jarihana.rhythm.domain.RhythmInput;

import java.util.List;

/**
 * {@code finished}는 클라이언트 화면에서 라이프를 모두 잃었다는 뜻이다. 서버 계산이 아직 살아 있으면
 * 그 뒤 입력이 없는 것으로 보고 끝까지 계산한다.
 */
public record RhythmBatchCommand(int sequence, double playedUntil, List<RhythmInput> inputs, boolean finished) {
    public RhythmBatchCommand {
        inputs = List.copyOf(inputs);
    }
}
