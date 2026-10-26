package com.project.jarihana.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.chat.command.service.ChatCommandService;
import com.project.jarihana.chat.domain.ChatLifecycleEvent;
import com.project.jarihana.chat.query.service.ChatQueryService;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;

import io.micrometer.core.instrument.MeterRegistry;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.LongStream;

class ChatPersistenceTest extends NotificationIntegrationTestSupport {
    @Autowired ChatCommandService commands;
    @Autowired ChatQueryService queries;
    @Autowired PlatformTransactionManager transactions;
    @Autowired ApplicationEventPublisher events;
    @Autowired MeterRegistry metrics;

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    @DisplayName("메시지 저장 지표는 외부 트랜잭션이 끝난 뒤 커밋 또는 롤백으로 기록한다")
    void recordsWriteMetricOnlyAfterTransactionCompletion(boolean rollback) {
        // Given
        Member owner = member("209");
        Group group = room(owner);
        var timer =
                metrics.timer(
                        "chat.message.write", "outcome", rollback ? "rolled_back" : "committed");
        long before = timer.count();

        // When
        new TransactionTemplate(transactions)
                .executeWithoutResult(
                        status -> {
                            commands.sendMessage(
                                    owner.getId(), group.getId(), UUID.randomUUID(), "지표 확인");
                            assertThat(timer.count()).isEqualTo(before);
                            if (rollback) status.setRollbackOnly();
                        });

        // Then
        assertThat(timer.count()).isEqualTo(before + 1);
    }

    @Test
    @DisplayName("본문 검증에 실패한 요청도 롤백 지표에 기록한다")
    void recordsRollbackMetricForInvalidContent() {
        // Given
        Member owner = member("210");
        Group group = room(owner);
        var timer = metrics.timer("chat.message.write", "outcome", "rolled_back");
        long before = timer.count();

        // When
        assertThatThrownBy(
                        () ->
                                commands.sendMessage(
                                        owner.getId(), group.getId(), UUID.randomUUID(), " "))
                .isInstanceOf(BusinessException.class);

        // Then
        assertThat(timer.count()).isEqualTo(before + 1);
    }

    @Test
    @DisplayName("동일 요청 20개는 한 번 저장하고 동시 메시지는 커밋 순번으로 복구한다")
    void concurrentRequestsDeduplicateAndAssignContiguousSequences() throws Exception {
        Member owner = member("201");
        Group group = room(owner);
        UUID key = UUID.randomUUID();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var retries = new ArrayList<Callable<Long>>();
            for (int index = 0; index < 20; index++) {
                retries.add(
                        () ->
                                commands.sendMessage(owner.getId(), group.getId(), key, "한 번")
                                        .message()
                                        .id());
            }
            var ids = new ArrayList<Long>();
            for (var future : executor.invokeAll(retries)) ids.add(future.get());
            assertThat(ids).hasSize(20).containsOnly(ids.getFirst());
            var writes = new ArrayList<Callable<Long>>();
            for (int index = 0; index < 32; index++) {
                writes.add(
                        () ->
                                commands.sendMessage(
                                                owner.getId(),
                                                group.getId(),
                                                UUID.randomUUID(),
                                                "동시")
                                        .message()
                                        .sequence());
            }
            var sequences = new ArrayList<Long>();
            for (var future : executor.invokeAll(writes)) sequences.add(future.get());
            assertThat(sequences).doesNotHaveDuplicates().hasSize(32);
        }
        var history = queries.history(owner.getId(), group.getId(), null, 0L, 100);
        assertThat(history.items()).hasSize(33);
        assertThat(history.items().stream().map(message -> message.sequence()).toList())
                .containsExactlyElementsOf(LongStream.rangeClosed(1, 33).boxed().toList());
        assertThat(history.latestSequence()).isEqualTo(33);
    }

    @Test
    @DisplayName("롤백 메시지는 순번과 함께 사라지고 종료 뒤 저장 요청 재확인은 가능하다")
    void rollbackPreservesSequenceAndEndedRoomAllowsIdempotentRetry() {
        Member owner = member("202");
        Group group = room(owner);
        var transaction = new TransactionTemplate(transactions);
        transaction.executeWithoutResult(
                status -> {
                    commands.sendMessage(owner.getId(), group.getId(), UUID.randomUUID(), "롤백");
                    status.setRollbackOnly();
                });
        UUID key = UUID.randomUUID();
        var saved = commands.sendMessage(owner.getId(), group.getId(), key, "저장").message();
        assertThat(saved.sequence()).isEqualTo(1);
        jdbc.update("update groups set status='ENDED' where id=?", group.getId());
        assertThat(commands.sendMessage(owner.getId(), group.getId(), key, "저장").created())
                .isFalse();
        assertThatThrownBy(
                        () ->
                                commands.sendMessage(
                                        owner.getId(), group.getId(), UUID.randomUUID(), "금지"))
                .isInstanceOf(BusinessException.class);
        assertThat(queries.history(owner.getId(), group.getId(), null, null, 50).items())
                .hasSize(1);
        assertThat(commands.markRead(owner.getId(), group.getId(), 1).lastReadSequence())
                .isEqualTo(1);
    }

    @Test
    @DisplayName("가입 전 메시지는 미확인에서 제외하고 읽음 순번은 역순 요청에도 감소하지 않는다")
    void baselineAndMonotonicReadExcludeOwnMessages() {
        Member owner = member("203");
        Member newcomer = member("204");
        Group group = room(owner);
        commands.sendMessage(owner.getId(), group.getId(), UUID.randomUUID(), "가입 전");
        new TransactionTemplate(transactions)
                .executeWithoutResult(
                        status -> {
                            groupMembers.save(GroupMember.createMember(group, newcomer, NOW));
                            events.publishEvent(
                                    new ChatLifecycleEvent(
                                            ChatLifecycleEvent.Type.JOINED,
                                            group.getId(),
                                            newcomer.getId()));
                        });
        assertThat(queries.rooms(newcomer.getId(), null, 20, "").items().getFirst().unreadCount())
                .isZero();
        commands.sendMessage(newcomer.getId(), group.getId(), UUID.randomUUID(), "내 메시지");
        commands.sendMessage(owner.getId(), group.getId(), UUID.randomUUID(), "다른 메시지");
        assertThat(queries.rooms(newcomer.getId(), null, 20, "").items().getFirst().unreadCount())
                .isEqualTo(1);
        commands.markRead(newcomer.getId(), group.getId(), 3);
        assertThat(commands.markRead(newcomer.getId(), group.getId(), 1).lastReadSequence())
                .isEqualTo(3);
        assertThatThrownBy(() -> commands.markRead(newcomer.getId(), group.getId(), 4))
                .isInstanceOf(BusinessException.class);
        assertThat(queries.history(newcomer.getId(), group.getId(), null, null, 50).items())
                .hasSize(3);
    }

    @Test
    @DisplayName("조회는 빈 방을 만들지 않고 양 방향 이력 커서가 페이지 경계를 지킨다")
    void emptyReadsDoNotWriteAndHistoryPagesPreserveOrder() {
        Member owner = member("205");
        Group group = room(owner);
        queries.rooms(owner.getId(), null, 100, "");
        queries.history(owner.getId(), group.getId(), null, null, 50);
        assertThat(jdbc.queryForObject("select count(*) from chat_room", Long.class)).isZero();
        for (int index = 0; index < 5; index++)
            commands.sendMessage(owner.getId(), group.getId(), UUID.randomUUID(), "메시지" + index);
        var latest = queries.history(owner.getId(), group.getId(), null, null, 2);
        assertThat(latest.items().stream().map(message -> message.sequence()).toList())
                .containsExactly(4L, 5L);
        assertThat(latest.nextCursor()).isEqualTo("4");
        var previous = queries.history(owner.getId(), group.getId(), 4L, null, 2);
        assertThat(previous.items().stream().map(message -> message.sequence()).toList())
                .containsExactly(2L, 3L);
        var catchup = queries.history(owner.getId(), group.getId(), null, 0L, 2);
        assertThat(catchup.items().stream().map(message -> message.sequence()).toList())
                .containsExactly(1L, 2L);
        assertThat(catchup.nextCursor()).isEqualTo("2");
        assertThatThrownBy(() -> queries.history(owner.getId(), group.getId(), 1L, 1L, 2))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("공백과 UTF16 초과 본문은 저장되지 않고 이모지 경계값은 저장된다")
    void validatesUtf16AndWhitespaceWithoutChangingContent() {
        Member owner = member("206");
        Group group = room(owner);
        assertThatThrownBy(
                        () ->
                                commands.sendMessage(
                                        owner.getId(), group.getId(), UUID.randomUUID(), " \n\t"))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(
                        () ->
                                commands.sendMessage(
                                        owner.getId(),
                                        group.getId(),
                                        UUID.randomUUID(),
                                        "😀".repeat(1001)))
                .isInstanceOf(BusinessException.class);
        String content = "😀".repeat(1000);
        assertThat(
                        commands.sendMessage(
                                        owner.getId(), group.getId(), UUID.randomUUID(), content)
                                .message()
                                .content())
                .isEqualTo(content);
    }

    private Group room(Member owner) {
        Group group =
                groups.save(Group.createClub("채팅" + owner.getId(), "소개", null, null, null, NOW));
        groupMembers.save(GroupMember.createLeader(group, owner, NOW));
        return group;
    }

    @Test
    @DisplayName("소속 INSERT의 외래키 잠금은 읽음 기준 저장까지 새 메시지를 대기시킨다")
    void membershipInsertProtectsBaselineUntilCommit() throws Exception {
        Member owner = member("207");
        Member newcomer = member("208");
        Group group = room(owner);
        commands.sendMessage(owner.getId(), group.getId(), UUID.randomUUID(), "이전");
        var inserted = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var joining =
                    executor.submit(
                            () ->
                                    new TransactionTemplate(transactions)
                                            .executeWithoutResult(
                                                    status -> {
                                                        groupMembers.save(
                                                                GroupMember.createMember(
                                                                        group, newcomer, NOW));
                                                        inserted.countDown();
                                                        try {
                                                            assertThat(
                                                                            release.await(
                                                                                    5,
                                                                                    TimeUnit
                                                                                            .SECONDS))
                                                                    .isTrue();
                                                        } catch (InterruptedException failure) {
                                                            throw new IllegalStateException(
                                                                    failure);
                                                        }
                                                        events.publishEvent(
                                                                new ChatLifecycleEvent(
                                                                        ChatLifecycleEvent.Type
                                                                                .JOINED,
                                                                        group.getId(),
                                                                        newcomer.getId()));
                                                    }));
            assertThat(inserted.await(5, TimeUnit.SECONDS)).isTrue();
            var sending =
                    executor.submit(
                            () ->
                                    commands.sendMessage(
                                            owner.getId(),
                                            group.getId(),
                                            UUID.randomUUID(),
                                            "가입 이후"));
            try {
                Awaitility.await()
                        .atMost(Duration.ofSeconds(3))
                        .untilAsserted(
                                () ->
                                        assertThat(
                                                        jdbc.queryForObject(
                                                                "select count(*) from"
                                                                    + " pg_stat_activity where"
                                                                    + " datname=current_database()"
                                                                    + " and wait_event_type='Lock'",
                                                                Long.class))
                                                .isGreaterThan(0));
                assertThat(sending).isNotDone();
            } finally {
                release.countDown();
            }
            joining.get(5, TimeUnit.SECONDS);
            sending.get(5, TimeUnit.SECONDS);
        }
        var room = queries.rooms(newcomer.getId(), null, 20, "").items().getFirst();
        assertThat(room.lastReadSequence()).isEqualTo(1);
        assertThat(room.unreadCount()).isEqualTo(1);
    }
}
