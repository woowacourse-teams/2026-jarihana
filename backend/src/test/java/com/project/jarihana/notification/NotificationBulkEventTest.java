package com.project.jarihana.notification;

import com.project.jarihana.group.command.service.GroupCommandService;
import com.project.jarihana.group.command.service.dto.CreateGroupCommand;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.group.domain.MeetingType;
import com.project.jarihana.group.domain.event.GroupCreatedEvent;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NotificationBulkEventTest extends NotificationIntegrationTestSupport {

    @Autowired private GroupCommandService groupService;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private ApplicationEventPublisher events;

    @Test
    @DisplayName("50명을 넘는 수신자에게 회원별 알림과 브라우저별 전송 대기를 빠짐없이 저장한다.")
    void createNotificationsAndBrowserDeliveriesAcrossChunks() {
        // Given
        Member creator = member("101");
        List<Member> recipients = recipients(200, 51, 2);

        // When
        long groupId = groupService.createGroup(creator.getId(), command()).id();

        // Then
        assertThat(jdbc.queryForList("select member_id from notifications", Long.class))
                .containsExactlyInAnyOrderElementsOf(recipients.stream().map(Member::getId).toList());
        assertThat(jdbc.queryForList("select event_key from notifications", String.class))
                .containsOnly("group:" + groupId + ":created");
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isEqualTo(102);
        assertThat(jdbc.queryForList("select count(*) from notification_deliveries group by notification_id", Long.class))
                .hasSize(51).containsOnly(2L);
        assertThat(jdbc.queryForObject("""
                select count(*) from notification_deliveries d
                join notifications n on n.id = d.notification_id
                join push_subscriptions s on s.id = d.push_subscription_id
                where n.member_id <> s.member_id or d.subscription_generation <> s.generation
                """, Integer.class)).isZero();
    }

    @Test
    @DisplayName("부분 중복과 전체 중복 재처리에서도 삭제 알림을 복원하거나 새 브라우저에 과거 전송을 만들지 않는다.")
    void replayOnlyCreatesNotificationsForNewRecipients() {
        // Given
        Member creator = member("101");
        List<Member> initial = recipients(200, 51, 1);
        long groupId = groupService.createGroup(creator.getId(), command()).id();
        String eventKey = "group:" + groupId + ":created";
        var deleted = notifications.findByEventKeyAndMemberId(eventKey, initial.getFirst().getId()).orElseThrow();
        notifications.save(deleted.delete(NOW));
        var lateBrowser = subscription(initial.get(1), "late-browser");
        recipients(300, 10, 1);
        GroupCreatedEvent event = new GroupCreatedEvent(groupId, creator.getId(), NOW);

        // When
        publish(event);
        publish(event);

        // Then
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isEqualTo(61);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isEqualTo(61);
        assertThat(jdbc.queryForObject("select count(*) from notifications where id = ? and deleted_at is not null",
                Integer.class, deleted.getId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries where push_subscription_id = ?",
                Integer.class, lateBrowser.getId())).isZero();
        assertThat(jdbc.queryForList("select count(*) from notifications group by event_key, member_id", Long.class))
                .containsOnly(1L);
    }

    @Test
    @DisplayName("동시에 같은 모임 사건을 처리해도 청크 경계의 알림과 전송은 한 번씩만 생성한다.")
    void concurrentEventsCreateEachRecipientAndDeliveryOnce() throws Exception {
        // Given
        Member creator = member("101");
        recipients(200, 51, 1);
        Group group = groups.save(Group.createClub("동시 모임", "함께해요", null, null, null, NOW));
        GroupCreatedEvent event = GroupCreatedEvent.from(group, creator.getId());
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> publishAfter(ready, start, event));
            var second = executor.submit(() -> publishAfter(ready, start, event));

            // When
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            first.get(20, TimeUnit.SECONDS);
            second.get(20, TimeUnit.SECONDS);

            // Then
            assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isEqualTo(51);
            assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isEqualTo(51);
            assertThat(jdbc.queryForList("select count(*) from notifications group by event_key, member_id", Long.class))
                    .containsOnly(1L);
        } finally {
            start.countDown();
        }
    }

    @Test
    @DisplayName("앞선 50건 저장 후 DB 오류가 발생하면 모임과 모든 알림·전송 대기를 함께 롤백한다.")
    void laterDeliveryFailureRollsBackGroupAndEarlierChunks() {
        // Given
        Member creator = member("101");
        recipients(200, 51, 1);
        jdbc.execute("""
                create function test_bulk_fail_delivery() returns trigger language plpgsql as $$
                begin
                    if (select count(*) from notification_deliveries) >= 50 then
                        raise exception 'TEST_BULK_DELIVERY_AFTER_50' using errcode = '23514';
                    end if;
                    return new;
                end $$
                """);
        try {
            jdbc.execute("""
                    create trigger test_bulk_fail_delivery before insert on notification_deliveries
                    for each row execute function test_bulk_fail_delivery()
                    """);

            // When
            assertThatThrownBy(() -> groupService.createGroup(creator.getId(), command()))
                    .hasStackTraceContaining("TEST_BULK_DELIVERY_AFTER_50");

            // Then
            assertThat(jdbc.queryForObject("select count(*) from groups", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from group_member", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isZero();
        } finally {
            jdbc.execute("drop trigger if exists test_bulk_fail_delivery on notification_deliveries");
            jdbc.execute("drop function test_bulk_fail_delivery()");
        }
    }

    @Test
    @DisplayName("알림 저장 사이 구독 세대가 바뀌어도 최초 수신 대상의 세대로 전송을 기록한다.")
    void retainGenerationCapturedBeforeNotificationInsert() {
        // Given
        Member creator = member("101");
        var target = subscription(member("200"), "generation-target");
        jdbc.execute("""
                create function test_bulk_change_generation() returns trigger language plpgsql as $$
                begin
                    update push_subscriptions set generation = generation + 1 where member_id = new.member_id;
                    return new;
                end $$
                """);
        try {
            jdbc.execute("""
                    create trigger test_bulk_change_generation after insert on notifications
                    for each row execute function test_bulk_change_generation()
                    """);

            // When
            groupService.createGroup(creator.getId(), command());

            // Then
            assertThat(jdbc.queryForObject("select generation from push_subscriptions where id = ?",
                    Long.class, target.getId())).isEqualTo(target.getGeneration() + 1);
            assertThat(jdbc.queryForObject("select subscription_generation from notification_deliveries where push_subscription_id = ?",
                    Long.class, target.getId())).isEqualTo(target.getGeneration());
        } finally {
            jdbc.execute("drop trigger if exists test_bulk_change_generation on notifications");
            jdbc.execute("drop function test_bulk_change_generation()");
        }
    }

    private List<Member> recipients(int firstId, int count, int browsers) {
        return IntStream.range(firstId, firstId + count).mapToObj(id -> {
            Member recipient = member(Integer.toString(id));
            for (int browser = 0; browser < browsers; browser++) {
                subscription(recipient, "bulk-" + id + "-" + browser);
            }
            return recipient;
        }).toList();
    }

    private void publishAfter(CountDownLatch ready, CountDownLatch start, GroupCreatedEvent event) {
        ready.countDown();
        try {
            if (!start.await(10, TimeUnit.SECONDS)) {
                throw new AssertionError("동시 사건 발행 신호가 도착하지 않았습니다.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
        publish(event);
    }

    private void publish(GroupCreatedEvent event) {
        new TransactionTemplate(transactions).executeWithoutResult(status -> events.publishEvent(event));
    }

    private CreateGroupCommand command() {
        return new CreateGroupCommand(GroupType.CLUB, "벌크 모임", "함께해요", null,
                MeetingType.FLEXIBLE, null, null, null, null);
    }
}
