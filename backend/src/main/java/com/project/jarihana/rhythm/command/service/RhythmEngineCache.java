package com.project.jarihana.rhythm.command.service;

import com.project.jarihana.rhythm.domain.RhythmEngine;

import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 진행 중인 판의 계산 상태를 메모리에 둔다. 묶음마다 처음부터 다시 계산하지 않기 위한 것이며,
 * 서버가 다시 뜨거나 순번이 맞지 않으면 저장한 묶음으로 다시 계산하므로 정확성은 DB 기록이 보장한다.
 */
@Component
class RhythmEngineCache {
    private static final int MAX_ENGINES = 300;

    private final Map<Long, Entry> entries = new ConcurrentHashMap<>();
    private final AtomicLong clock = new AtomicLong();

    /**
     * 꺼낸 상태는 캐시에서 지운다. 계산 도중 실패하면 다음 묶음에서 DB 기록으로 다시 만든다.
     */
    Optional<RhythmEngine> take(long challengeId, int sequence) {
        Entry entry = entries.remove(challengeId);
        if (entry == null || entry.sequence != sequence) {
            return Optional.empty();
        }
        return Optional.of(entry.engine);
    }

    void put(long challengeId, int sequence, RhythmEngine engine) {
        entries.put(challengeId, new Entry(engine, sequence, clock.incrementAndGet()));
        if (entries.size() > MAX_ENGINES) {
            entries.entrySet().stream()
                    .min(Comparator.comparingLong(item -> item.getValue().touchedAt))
                    .ifPresent(oldest -> entries.remove(oldest.getKey(), oldest.getValue()));
        }
    }

    void remove(long challengeId) {
        entries.remove(challengeId);
    }

    private record Entry(RhythmEngine engine, int sequence, long touchedAt) {
    }
}
