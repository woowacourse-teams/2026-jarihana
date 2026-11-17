package com.project.jarihana.rhythmbattle.command.service;

import com.project.jarihana.rhythm.domain.RhythmEngine;

import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 진행 중인 대전 판의 계산 상태를 메모리에 둔다. 묶음마다 처음부터 다시 계산하지 않기 위한 것이며,
 * 서버가 다시 뜨거나 순번이 맞지 않으면 저장한 묶음으로 다시 계산하므로 정확성은 DB 기록이 보장한다.
 */
@Component
class BattleEngineCache {
    private static final int MAX_ENGINES = 200;

    private final Map<Long, Entry> entries = new ConcurrentHashMap<>();
    private final AtomicLong clock = new AtomicLong();

    Optional<RhythmEngine> take(long runId, int sequence) {
        Entry entry = entries.remove(runId);
        if (entry == null || entry.sequence != sequence) {
            return Optional.empty();
        }
        return Optional.of(entry.engine);
    }

    void put(long runId, int sequence, RhythmEngine engine) {
        entries.put(runId, new Entry(engine, sequence, clock.incrementAndGet()));
        if (entries.size() > MAX_ENGINES) {
            entries.entrySet().stream()
                    .min(Comparator.comparingLong(item -> item.getValue().touchedAt))
                    .ifPresent(oldest -> entries.remove(oldest.getKey(), oldest.getValue()));
        }
    }

    void remove(long runId) {
        entries.remove(runId);
    }

    private record Entry(RhythmEngine engine, int sequence, long touchedAt) {
    }
}
