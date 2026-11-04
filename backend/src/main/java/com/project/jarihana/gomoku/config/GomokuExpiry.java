package com.project.jarihana.gomoku.config;

import com.project.jarihana.gomoku.command.repository.GomokuRoomRepository;
import com.project.jarihana.gomoku.command.service.GomokuCommandService;

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

@Component
@ConditionalOnProperty(name = "gomoku.expiry.enabled", havingValue = "true", matchIfMissing = true)
public class GomokuExpiry {
    private static final Logger log = LoggerFactory.getLogger(GomokuExpiry.class);
    private final ScheduledExecutorService worker =
            Executors.newSingleThreadScheduledExecutor(
                    Thread.ofPlatform().daemon().name("gomoku-expiry").factory());

    public GomokuExpiry(GomokuRoomRepository rooms, GomokuCommandService commands, Clock clock) {
        worker.scheduleWithFixedDelay(
                () -> {
                    try {
                        LocalDateTime now = LocalDateTime.now(clock);
                        for (long id :
                                rooms.findExpired(
                                        now, now.minusMinutes(30), PageRequest.of(0, 100)))
                            commands.expire(id);
                    } catch (RuntimeException exception) {
                        log.warn("Gomoku expiration deferred after a database failure", exception);
                    }
                },
                500,
                500,
                TimeUnit.MILLISECONDS);
    }

    @PreDestroy
    public void close() {
        worker.shutdownNow();
    }
}
