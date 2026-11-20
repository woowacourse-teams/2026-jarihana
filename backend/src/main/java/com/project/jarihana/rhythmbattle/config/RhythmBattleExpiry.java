package com.project.jarihana.rhythmbattle.config;

import com.project.jarihana.rhythmbattle.command.repository.RhythmBattleRoomRepository;
import com.project.jarihana.rhythmbattle.command.service.RhythmBattleCommandService;

import jakarta.annotation.PreDestroy;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * 1초마다 입력 묶음이 끊긴 판과 오래 활동이 없는 방을 정리한다. 상대가 연결을 잃어도 판이 끝나도록 한다.
 */
@Component
@ConditionalOnProperty(name = "rhythm-battle.expiry.enabled", havingValue = "true", matchIfMissing = true)
public class RhythmBattleExpiry {
    private static final Logger log = LoggerFactory.getLogger(RhythmBattleExpiry.class);
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().daemon().name("rhythm-battle-expiry").factory());

    public RhythmBattleExpiry(RhythmBattleRoomRepository rooms, RhythmBattleCommandService commands, Clock clock) {
        worker.scheduleWithFixedDelay(() -> {
            try {
                LocalDateTime now = LocalDateTime.now(clock);
                for (long id : rooms.findExpired(now.minusMinutes(30), now.minusSeconds(30), PageRequest.of(0, 100))) {
                    commands.expire(id);
                }
            } catch (RuntimeException exception) {
                log.warn("Rhythm battle expiration deferred after a database failure", exception);
            }
        }, 1, 1, TimeUnit.SECONDS);
    }

    @PreDestroy
    public void close() {
        worker.shutdownNow();
    }
}
