package com.project.jarihana.rhythm.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.rhythm.command.repository.RhythmChallengeBatchRepository;
import com.project.jarihana.rhythm.command.repository.RhythmChallengeRepository;
import com.project.jarihana.rhythm.command.service.dto.RhythmBatchCommand;
import com.project.jarihana.rhythm.domain.RhythmChallenge;
import com.project.jarihana.rhythm.domain.RhythmChallengeBatch;
import com.project.jarihana.rhythm.domain.RhythmChart;
import com.project.jarihana.rhythm.domain.RhythmEngine;
import com.project.jarihana.rhythm.domain.RhythmInvalidReason;
import com.project.jarihana.rhythm.domain.RhythmLevel;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class RhythmChallengeCommandService {
    // 클라이언트가 판이 끝났다고 알린 뒤 서버 계산을 입력 없이 이어 갈 최대 시간이다.
    private static final double FINISH_SIMULATION_SECONDS = 600;
    private static final SecureRandom SEEDS = new SecureRandom();

    private final RhythmChallengeRepository challenges;
    private final RhythmChallengeBatchRepository batches;
    private final RhythmEngineCache engines;
    private final RhythmChart chart;
    private final Clock clock;

    @Transactional
    public RhythmChallenge create(long memberId, RhythmLevel level, double scrollSpeed) {
        int seed = SEEDS.nextInt(1, Integer.MAX_VALUE);
        return challenges.save(RhythmChallenge.create(memberId, level, scrollSpeed, seed, chart, LocalDateTime.now(clock)));
    }

    @Transactional
    public RhythmChallenge start(long memberId, long challengeId) {
        LocalDateTime now = LocalDateTime.now(clock);
        RhythmChallenge challenge = expire(lockOwned(memberId, challengeId), now);
        if (challenge.getStatus().closed()) {
            return challenge;
        }
        return challenges.save(challenge.start(now));
    }

    /**
     * 입력 묶음을 순번대로 계산한다. 같은 순번을 다시 보내면 계산하지 않고 현재 상태를 돌려줘 재시도를 안전하게 한다.
     */
    @Transactional
    public RhythmChallenge submit(long memberId, long challengeId, RhythmBatchCommand command) {
        LocalDateTime now = LocalDateTime.now(clock);
        RhythmChallenge challenge = expire(lockOwned(memberId, challengeId), now);
        if (challenge.getStatus().closed() || command.sequence() == challenge.getLastSequence()) {
            return challenge;
        }
        RhythmInvalidReason violation = challenge.checkBatch(command.sequence(), command.playedUntil(), command.inputs(), now);
        if (violation != null) {
            engines.remove(challengeId);
            return challenges.save(challenge.invalidate(violation, now));
        }
        RhythmEngine engine = engines.take(challengeId, challenge.getLastSequence())
                .orElseGet(() -> rebuild(challenge));
        engine.play(command.inputs(), command.playedUntil());
        if (command.finished() && !engine.dead()) {
            engine.playUntilDead(command.playedUntil(), command.playedUntil() + FINISH_SIMULATION_SECONDS);
        }
        batches.save(RhythmChallengeBatch.of(challengeId, command.sequence(), command.playedUntil(), command.inputs(), now));
        RhythmChallenge recorded = challenge.record(command.sequence(), command.playedUntil(), command.inputs(), engine, now);
        if (recorded.getStatus().closed()) {
            engines.remove(challengeId);
        } else {
            engines.put(challengeId, command.sequence(), engine);
        }
        return challenges.save(recorded);
    }

    @Transactional
    public RhythmChallenge abandon(long memberId, long challengeId) {
        LocalDateTime now = LocalDateTime.now(clock);
        RhythmChallenge challenge = lockOwned(memberId, challengeId);
        engines.remove(challengeId);
        RhythmChallenge abandoned = challenge.invalidate(RhythmInvalidReason.ABANDONED, now);
        return abandoned == challenge ? challenge : challenges.save(abandoned);
    }

    private RhythmChallenge lockOwned(long memberId, long challengeId) {
        return challenges.lockById(challengeId)
                .filter(challenge -> challenge.isOwnedBy(memberId))
                .orElseThrow(() -> new BusinessException(ErrorCode.RHYTHM_CHALLENGE_NOT_FOUND, "도전 기록을 찾을 수 없어요."));
    }

    private RhythmChallenge expire(RhythmChallenge challenge, LocalDateTime now) {
        RhythmChallenge expired = challenge.expire(now);
        if (expired == challenge) {
            return challenge;
        }
        engines.remove(challenge.getId());
        return challenges.save(expired);
    }

    private RhythmEngine rebuild(RhythmChallenge challenge) {
        RhythmEngine engine = challenge.newEngine(chart);
        for (RhythmChallengeBatch batch : batches.findByChallengeIdOrderBySequence(challenge.getId())) {
            engine.play(batch.decodeInputs(), batch.getPlayedUntil());
        }
        return engine;
    }
}
