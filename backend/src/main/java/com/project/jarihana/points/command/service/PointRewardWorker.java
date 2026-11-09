package com.project.jarihana.points.command.service;

import com.project.jarihana.common.deployment.ApplicationActivity;
import com.project.jarihana.points.command.repository.PointCommandRepository.DueReward;
import com.project.jarihana.points.command.repository.PointCommandRepository;
import com.project.jarihana.points.config.PointPolicy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.RecoverableDataAccessException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicReference;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@RequiredArgsConstructor
@Slf4j
public class PointRewardWorker {
    private static final int BATCH_SIZE = 20;
    private static final int SIGNUP_BACKFILL_BATCH_SIZE = 100;
    private final PointCommandRepository repository;
    private final TransactionTemplate transaction;
    private final Clock clock;
    private final ApplicationActivity activity;
    private final PointPolicy policy;
    private final PointRewardService rewards;

    @Scheduled(fixedDelayString = "${jarihana.points.poll-delay:1000}",
            initialDelayString = "${jarihana.points.poll-delay:1000}")
    public void processDue() {
        if (!policy.isActiveAt(LocalDateTime.now(clock))) {
            return;
        }
        try (var running = activity.beginBackground()) {
            for (int index = 0; index < BATCH_SIZE && processOne(); index++) {
                // Each reward commits independently.
            }
        } catch (RuntimeException failure) {
            log.atWarn().addKeyValue("error.type", failure.getClass().getSimpleName())
                    .log("points.worker.failed");
        }
    }

    @Scheduled(fixedDelayString = "${jarihana.points.signup-backfill-delay:30000}",
            initialDelayString = "${jarihana.points.signup-backfill-delay:30000}")
    public void backfillSignupRewards() {
        LocalDateTime now = LocalDateTime.now(clock);
        if (!policy.isActiveAt(now)) {
            return;
        }
        try (var running = activity.beginBackground()) {
            transaction.executeWithoutResult(status -> rewards.backfillSignupRewards(now, SIGNUP_BACKFILL_BATCH_SIZE));
        } catch (RuntimeException failure) {
            log.atWarn().addKeyValue("error.type", failure.getClass().getSimpleName())
                    .log("points.signup.backfill.failed");
        }
    }

    boolean processOne() {
        AtomicReference<DueReward> selected = new AtomicReference<>();
        try {
            return Boolean.TRUE.equals(transaction.execute(status -> {
                LocalDateTime now = LocalDateTime.now(clock);
                return repository.lockNextDue(now).map(reward -> {
                    selected.set(reward);
                    repository.complete(reward, now);
                    return true;
                }).orElse(false);
            }));
        } catch (RuntimeException failure) {
            DueReward reward = selected.get();
            if (reward == null) {
                throw failure;
            }
            boolean retry = failure instanceof TransientDataAccessException
                    || failure instanceof RecoverableDataAccessException
                    || failure instanceof DataAccessResourceFailureException;
            long delay = Math.min(300, 5L << Math.min(reward.attempts(), 6));
            transaction.executeWithoutResult(status ->
                    repository.recordFailure(reward, LocalDateTime.now(clock).plusSeconds(delay), retry));
            log.atWarn().addKeyValue("reward.id", reward.id()).addKeyValue("retry", retry)
                    .addKeyValue("error.type", failure.getClass().getSimpleName()).log("points.reward.failed");
            return true;
        }
    }
}
