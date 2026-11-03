package com.project.jarihana.minigame.command.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.minigame.command.repository.MinigameCutCommandRepository;
import com.project.jarihana.minigame.command.repository.MinigameRunCommandRepository;
import com.project.jarihana.minigame.command.service.dto.CutCommand;
import com.project.jarihana.minigame.domain.MinigameEvent;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class PeperoDayRunConcurrencyTest extends IntegrationTestSupport {

    private static final int THREADS = 6;

    @Autowired
    private PeperoDayRunCommandService peperoDayRunCommandService;

    @Autowired
    private MinigameRunCommandRepository minigameRunCommandRepository;

    @Autowired
    private MinigameCutCommandRepository minigameCutCommandRepository;

    @Autowired
    private MemberRepository memberRepository;

    @DisplayName("같은 회원이 순위 도전을 동시에 여러 번 시작해도 하루 3번까지만 시작된다.")
    @Test
    void limitsConcurrentRunStarts() throws Exception {
        // Given
        Member member = memberRepository.save(Member.create("모카", 8, "pepero-concurrent-start", Course.BACKEND));

        // When
        List<Attempt> attempts = runTogether(() -> {
            peperoDayRunCommandService.start(member.getId());
            return Attempt.succeeded();
        });

        // Then
        assertThat(attempts).filteredOn(Attempt::succeededAttempt).hasSize(3);
        assertThat(attempts)
                .filteredOn(attempt -> attempt.errorCode() == ErrorCode.MINIGAME_ATTEMPT_LIMIT_EXCEEDED)
                .hasSize(THREADS - 3);
        assertThat(minigameRunCommandRepository.countByEventAndMemberIdAndPlayedOn(
                MinigameEvent.PEPERO_DAY_2026,
                member.getId(),
                TestSupportConfig.FIXED_NOW.toLocalDate()
        )).isEqualTo(3);
    }

    @DisplayName("같은 막대를 동시에 여러 번 잘라도 한 번만 기록되고 나머지는 차례 충돌로 거절된다.")
    @Test
    void recordsConcurrentCutsOnce() throws Exception {
        // Given
        Member member = memberRepository.save(Member.create("모카", 8, "pepero-concurrent-cut", Course.BACKEND));
        long runId = peperoDayRunCommandService.start(member.getId()).runId();

        // When
        List<Attempt> attempts = runTogether(() -> {
            peperoDayRunCommandService.cut(new CutCommand(member.getId(), runId, 1, 6));
            return Attempt.succeeded();
        });

        // Then
        assertThat(attempts).filteredOn(Attempt::succeededAttempt).hasSize(1);
        assertThat(attempts)
                .filteredOn(attempt -> attempt.errorCode() == ErrorCode.MINIGAME_ROUND_CONFLICT)
                .hasSize(THREADS - 1);
        assertThat(minigameCutCommandRepository.count()).isEqualTo(1);
        assertThat(minigameRunCommandRepository.findById(runId).orElseThrow().currentRound()).isEqualTo(2);
    }

    private List<Attempt> runTogether(Callable<Attempt> action) throws Exception {
        CountDownLatch ready = new CountDownLatch(THREADS);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(THREADS);
        try {
            List<Future<Attempt>> futures = new ArrayList<>();
            for (int index = 0; index < THREADS; index++) {
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    if (!start.await(3, TimeUnit.SECONDS)) {
                        throw new IllegalStateException("동시 요청 시작 대기 시간이 초과되었습니다.");
                    }
                    try {
                        return action.call();
                    } catch (BusinessException exception) {
                        return Attempt.failed(exception.getErrorCode());
                    }
                }));
            }
            assertThat(ready.await(3, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            List<Attempt> attempts = new ArrayList<>();
            for (Future<Attempt> future : futures) {
                attempts.add(future.get(10, TimeUnit.SECONDS));
            }
            return attempts;
        } finally {
            executor.shutdownNow();
        }
    }

    private record Attempt(boolean succeededAttempt, ErrorCode errorCode) {

        static Attempt succeeded() {
            return new Attempt(true, null);
        }

        static Attempt failed(ErrorCode errorCode) {
            return new Attempt(false, errorCode);
        }
    }
}
