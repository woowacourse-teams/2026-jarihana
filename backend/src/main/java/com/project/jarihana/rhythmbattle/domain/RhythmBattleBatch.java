package com.project.jarihana.rhythmbattle.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.rhythm.domain.RhythmInput;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 대전 판에서 받은 입력 묶음을 그대로 남긴다. 계산 캐시를 잃었을 때 다시 계산하고, 상대 화면에 판을 다시 그려 줄 때 쓴다.
 * 입력은 {@code 방향순번:시각}을 {@code ;}로 이은 문자열이며 시각은 받은 double 값을 손실 없이 적는다.
 */
@Getter
@Entity
@Table(name = "rhythm_battle_batch")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RhythmBattleBatch extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private long runId;
    private int sequence;
    private double playedUntil;
    @Column(columnDefinition = "text")
    private String inputs;

    private RhythmBattleBatch(long runId, int sequence, double playedUntil, String inputs, LocalDateTime now) {
        super(now);
        this.runId = runId;
        this.sequence = sequence;
        this.playedUntil = playedUntil;
        this.inputs = inputs;
    }

    public static RhythmBattleBatch of(long runId, int sequence, double playedUntil, List<RhythmInput> inputs,
            LocalDateTime now) {
        return new RhythmBattleBatch(runId, sequence, playedUntil, encode(inputs), now);
    }

    public static String encode(List<RhythmInput> inputs) {
        StringBuilder encoded = new StringBuilder();
        for (RhythmInput input : inputs) {
            if (!encoded.isEmpty()) {
                encoded.append(';');
            }
            encoded.append(input.lane().ordinal()).append(':').append(Double.toString(input.at()));
        }
        return encoded.toString();
    }

    public static List<RhythmInput> decode(String inputs) {
        List<RhythmInput> decoded = new ArrayList<>();
        if (inputs.isEmpty()) {
            return decoded;
        }
        for (String item : inputs.split(";")) {
            int separator = item.indexOf(':');
            decoded.add(RhythmInput.of(Integer.parseInt(item.substring(0, separator)),
                    Double.parseDouble(item.substring(separator + 1))));
        }
        return decoded;
    }

    public List<RhythmInput> decodeInputs() {
        return decode(inputs);
    }

    @Override
    public boolean equals(Object other) {
        return this == other || other instanceof RhythmBattleBatch batch && id != null && id.equals(batch.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
