package com.project.jarihana.chat;

import static org.assertj.core.api.Assertions.assertThat;

import com.project.jarihana.chat.command.repository.MemberActivityCommandRepository;
import com.project.jarihana.chat.command.service.MemberActivityCommandService;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

class MemberActivityPersistenceTest extends NotificationIntegrationTestSupport {
    @Autowired MemberActivityCommandRepository activity;
    @Autowired MemberActivityCommandService commands;
    @Autowired PlatformTransactionManager transactions;

    @Test
    @DisplayName("여러 서버의 동시 활성 보고는 계정 행 하나의 가장 최신 시각을 보존한다")
    void concurrentServerReportsKeepOneMonotonicAccountRow() throws Exception {
        // Given
        Member owner = member("320");
        var reports = new ArrayList<Callable<Void>>();
        for (int second = 19; second >= 0; second--) {
            var server = serviceAt(NOW.plusSeconds(second));
            reports.add(
                    () -> {
                        new TransactionTemplate(transactions)
                                .executeWithoutResult(status -> server.reportActive(owner.getId()));
                        return null;
                    });
        }

        // When
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (var result : executor.invokeAll(reports)) result.get();
        }

        // Then
        assertThat(jdbc.queryForObject("select count(*) from member_activity", Long.class))
                .isEqualTo(1);
        assertThat(lastActiveAt(owner)).isEqualTo(NOW.plusSeconds(19));
        assertThat(jdbc.queryForObject(
                        "select relpersistence::text from pg_class where oid = 'member_activity'::regclass",
                        String.class))
                .isEqualTo("u");
        commands.reportActive(owner.getId());
        assertThat(lastActiveAt(owner)).isEqualTo(NOW.plusSeconds(19));
    }

    @Test
    @DisplayName("중복과 역순 활성 보고는 쓰기를 생략하고 다음 10초 보고는 즉시 반영한다")
    void skipsDuplicateWritesWithoutThrottlingTheNextReport() {
        // Given
        Member owner = member("321");
        commands.reportActive(owner.getId());
        var transaction = new TransactionTemplate(transactions);

        // When
        int duplicate = transaction.execute(status -> activity.updateIfNewer(owner.getId(), NOW));
        int older =
                transaction.execute(
                        status -> activity.updateIfNewer(owner.getId(), NOW.minusSeconds(1)));
        int next =
                transaction.execute(
                        status -> activity.updateIfNewer(owner.getId(), NOW.plusSeconds(10)));

        // Then
        assertThat(duplicate).isZero();
        assertThat(older).isZero();
        assertThat(next).isEqualTo(1);
        assertThat(lastActiveAt(owner)).isEqualTo(NOW.plusSeconds(10));
    }

    @Test
    @DisplayName("존재하지 않거나 탈퇴한 회원의 활성 상태는 만들거나 갱신하지 않는다")
    void ignoresUnavailableMembers() {
        // Given
        Member owner = member("322");
        commands.reportActive(owner.getId());
        jdbc.update("update member set withdrawn_at=? where id=?", NOW, owner.getId());

        // When
        var later = serviceAt(NOW.plusSeconds(10));
        new TransactionTemplate(transactions)
                .executeWithoutResult(
                        status -> {
                            later.reportActive(owner.getId());
                            later.reportActive(Long.MAX_VALUE);
                        });

        // Then
        assertThat(jdbc.queryForObject("select count(*) from member_activity", Long.class))
                .isEqualTo(1);
        assertThat(lastActiveAt(owner)).isEqualTo(NOW);
    }

    private MemberActivityCommandService serviceAt(LocalDateTime now) {
        ZoneId zone = ZoneId.of("Asia/Seoul");
        return new MemberActivityCommandService(
                activity, Clock.fixed(now.atZone(zone).toInstant(), zone));
    }

    private LocalDateTime lastActiveAt(Member owner) {
        return jdbc.queryForObject(
                "select last_active_at from member_activity where member_id=?",
                LocalDateTime.class,
                owner.getId());
    }
}
