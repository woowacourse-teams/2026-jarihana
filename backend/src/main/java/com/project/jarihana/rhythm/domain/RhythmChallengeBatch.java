package com.project.jarihana.rhythm.domain;

import com.project.jarihana.common.domain.BaseEntity;

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
 * 받은 입력 묶음을 그대로 남긴다. 서버가 다시 뜨거나 계산 캐시를 잃어도 순서대로 다시 계산할 수 있다.
 * 입력은 {@code 방향순번:시각}을 {@code ;}로 이은 문자열이며 시각은 받은 double 값을 손실 없이 적는다.
 */
@Getter
@Entity
@Table(name = "rhythm_challenge_batch")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RhythmChallengeBatch extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private long challengeId;
    private int sequence;
    private double playedUntil;
    @Column(columnDefinition = "text")
    private String inputs;

    private RhythmChallengeBatch(long challengeId, int sequence, double playedUntil, String inputs, LocalDateTime now) {
        super(now);
        this.challengeId = challengeId;
        this.sequence = sequence;
        this.playedUntil = playedUntil;
        this.inputs = inputs;
    }

    public static RhythmChallengeBatch of(long challengeId, int sequence, double playedUntil, List<RhythmInput> inputs,
            LocalDateTime now) {
        StringBuilder encoded = new StringBuilder();
        for (RhythmInput input : inputs) {
            if (!encoded.isEmpty()) {
                encoded.append(';');
            }
            encoded.append(input.lane().ordinal()).append(':').append(Double.toString(input.at()));
        }
        return new RhythmChallengeBatch(challengeId, sequence, playedUntil, encoded.toString(), now);
    }

    public List<RhythmInput> decodeInputs() {
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

    @Override
    public boolean equals(Object other) {
        return this == other || other instanceof RhythmChallengeBatch batch && id != null && id.equals(batch.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
