package com.project.jarihana.rhythm.command.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.rhythm.command.service.dto.RhythmBatchCommand;
import com.project.jarihana.rhythm.domain.RhythmChallenge;
import com.project.jarihana.rhythm.domain.RhythmInput;
import com.project.jarihana.rhythm.domain.RhythmLevel;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;

class RhythmChallengeCommandServiceTest extends IntegrationTestSupport {
    @Autowired RhythmChallengeCommandService commands;
    @Autowired RhythmEngineCache engines;
    @Autowired MemberRepository members;
    @Autowired JdbcTemplate jdbc;

    @Test
    @DisplayName("계산 캐시를 잃어도 저장한 입력 묶음으로 다시 계산해 끊김 없이 진행한 판과 같은 결과를 낸다")
    void rebuildsEngineFromStoredBatches() {
        // Given
        long memberId = members.save(Member.create("가을", 23, "rhythm-rebuild", Course.BACKEND)).getId();
        long steady = begin(memberId);
        long rebuilt = begin(memberId);
        jdbc.update("update rhythm_challenge set seed=(select seed from rhythm_challenge where id=?) where id=?", steady, rebuilt);
        List<List<RhythmInput>> batches = mashing();

        // When
        RhythmChallenge expected = null;
        RhythmChallenge actual = null;
        for (int index = 0; index < batches.size(); index++) {
            double until = (index + 1) * 2.0;
            elapse(steady, until);
            elapse(rebuilt, until);
            engines.remove(rebuilt);
            RhythmBatchCommand command = new RhythmBatchCommand(index + 1, until, batches.get(index), false);
            expected = commands.submit(memberId, steady, command);
            actual = commands.submit(memberId, rebuilt, command);
        }

        // Then
        assertThat(actual.getScore()).isEqualTo(expected.getScore());
        assertThat(actual.getLives()).isEqualTo(expected.getLives());
        assertThat(actual.getPoorCount()).isEqualTo(expected.getPoorCount());
        assertThat(actual.getPerfectCount() + actual.getHitCount() + actual.getEnoughCount())
                .isEqualTo(expected.getPerfectCount() + expected.getHitCount() + expected.getEnoughCount());
        assertThat(actual.getStatus()).isEqualTo(expected.getStatus());
    }

    private long begin(long memberId) {
        long id = commands.create(memberId, RhythmLevel.HARD, 1).getId();
        commands.start(memberId, id);
        return id;
    }

    private void elapse(long id, double seconds) {
        jdbc.update("update rhythm_challenge set started_at=?, last_batch_at=? where id=?",
                TestSupportConfig.FIXED_NOW.minusNanos((long) (seconds * 1_000_000_000L)), TestSupportConfig.FIXED_NOW, id);
    }

    // 네 방향을 일정한 간격으로 누르는 입력이다. 맞는 판정과 헛공격이 섞인다.
    private static List<List<RhythmInput>> mashing() {
        List<List<RhythmInput>> batches = new ArrayList<>();
        for (int batch = 0; batch < 10; batch++) {
            List<RhythmInput> inputs = new ArrayList<>();
            for (double at = batch * 2.0; at < (batch + 1) * 2.0; at += 0.23) {
                inputs.add(RhythmInput.of((int) (at * 10) % 4, at));
            }
            batches.add(inputs);
        }
        return batches;
    }
}
