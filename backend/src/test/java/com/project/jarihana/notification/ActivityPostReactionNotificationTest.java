package com.project.jarihana.notification;

import com.project.jarihana.activitypost.command.repository.ActivityPostCommandRepository;
import com.project.jarihana.activitypost.command.service.ActivityPostReactionCommandService;
import com.project.jarihana.activitypost.domain.ActivityPost;
import com.project.jarihana.activitypost.domain.ReactionEmoji;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

class ActivityPostReactionNotificationTest extends NotificationIntegrationTestSupport {

    @Autowired private ActivityPostReactionCommandService reactionService;
    @Autowired private ActivityPostCommandRepository posts;
    @Autowired private PlatformTransactionManager transactions;

    @Test
    @DisplayName("첫 좋아요는 기록 작성자에게 알리고, 작성자가 읽기 전에 이어진 좋아요는 같은 알림에 모은다.")
    void collectHeartsIntoOneUnreadNotification() {
        // Given
        Member author = member("101");
        subscription(author, "phone");
        subscription(author, "desktop");
        ActivityPost post = post(author);

        // When
        reactionService.addToPost(member("102").getId(), post.getId(), ReactionEmoji.HEART);
        reactionService.addToPost(member("103").getId(), post.getId(), ReactionEmoji.HEART);
        reactionService.addToPost(member("104").getId(), post.getId(), ReactionEmoji.HEART);

        // Then
        long firstReactionId = jdbc.queryForObject("select min(id) from activity_post_reaction", Long.class);
        assertThat(jdbc.queryForList("select member_id from notifications", Long.class)).containsExactly(author.getId());
        assertThat(jdbc.queryForObject("select event_type from notifications", String.class))
                .isEqualTo("ACTIVITY_POST_REACTED");
        assertThat(jdbc.queryForObject("select event_key from notifications", String.class))
                .isEqualTo("activity-post-reaction:" + firstReactionId + ":created");
        assertThat(jdbc.queryForObject("select payload::text from notifications", String.class))
                .isEqualTo("{\"groupId\": " + post.getGroup().getId() + ", \"activityPostId\": " + post.getId() + "}");
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isEqualTo(2);
    }

    @Test
    @DisplayName("작성자가 좋아요 알림을 읽거나 지운 뒤 들어온 좋아요는 새 알림으로 다시 알린다.")
    void notifyAgainAfterAuthorReadsOrDeletes() {
        // Given
        Member author = member("101");
        subscription(author, "phone");
        ActivityPost post = post(author);
        reactionService.addToPost(member("102").getId(), post.getId(), ReactionEmoji.HEART);
        jdbc.update("update notifications set read_at = ?", NOW);

        // When
        reactionService.addToPost(member("103").getId(), post.getId(), ReactionEmoji.HEART);
        jdbc.update("update notifications set deleted_at = ? where read_at is null", NOW);
        reactionService.addToPost(member("104").getId(), post.getId(), ReactionEmoji.HEART);

        // Then
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("""
                select count(*) from notifications where read_at is null and deleted_at is null
                """, Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isEqualTo(3);
    }

    @Test
    @DisplayName("본인 좋아요, 탈퇴한 작성자, 다른 기록의 읽지 않은 알림은 새 좋아요 알림 여부에 영향을 주지 않는다.")
    void skipSelfAndWithdrawnAndSeparatePosts() {
        // Given
        Member author = member("101");
        Member withdrawn = member("102");
        Member reactor = member("103");
        ActivityPost first = post(author);
        ActivityPost second = post(author);
        ActivityPost orphaned = post(withdrawn);
        jdbc.update("update member set withdrawn_at = ? where id = ?", NOW, withdrawn.getId());

        // When
        reactionService.addToPost(author.getId(), first.getId(), ReactionEmoji.HEART);
        reactionService.addToPost(reactor.getId(), orphaned.getId(), ReactionEmoji.HEART);
        reactionService.addToPost(reactor.getId(), first.getId(), ReactionEmoji.HEART);
        reactionService.addToPost(reactor.getId(), second.getId(), ReactionEmoji.HEART);

        // Then
        assertThat(jdbc.queryForList("select member_id from notifications", Long.class))
                .containsExactly(author.getId(), author.getId());
        assertThat(jdbc.queryForList("select cast(payload ->> 'activityPostId' as bigint) from notifications", Long.class))
                .containsExactlyInAnyOrder(first.getId(), second.getId());
    }

    @Test
    @DisplayName("읽지 않은 알림이 있는 동안 좋아요를 껐다 켜도 알림과 전송을 늘리지 않는다.")
    void toggleWhileUnreadDoesNotRenotify() {
        // Given
        Member author = member("101");
        Member reactor = member("102");
        subscription(author, "phone");
        ActivityPost post = post(author);
        reactionService.addToPost(reactor.getId(), post.getId(), ReactionEmoji.HEART);

        // When
        reactionService.removeFromPost(reactor.getId(), post.getId(), ReactionEmoji.HEART);
        reactionService.addToPost(reactor.getId(), post.getId(), ReactionEmoji.HEART);
        reactionService.addToPost(reactor.getId(), post.getId(), ReactionEmoji.HEART);

        // Then
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("좋아요 저장이 롤백되면 알림과 전송 대기도 남지 않는다.")
    void rollbackReactionLeavesNoNotifications() {
        // Given
        Member author = member("101");
        Member reactor = member("102");
        subscription(author, "phone");
        ActivityPost post = post(author);

        // When
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            reactionService.addToPost(reactor.getId(), post.getId(), ReactionEmoji.HEART);
            status.setRollbackOnly();
        });

        // Then
        assertThat(jdbc.queryForObject("select count(*) from activity_post_reaction", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isZero();
    }

    @Test
    @DisplayName("서로 다른 두 회원의 첫 좋아요가 함께 커밋 직전에 이르러도 읽지 않은 좋아요 알림과 전송은 한 건만 만든다.")
    void concurrentFirstHeartsShareOneUnreadNotification() throws Exception {
        // Given
        Member author = member("101");
        Member firstReactor = member("102");
        Member secondReactor = member("103");
        subscription(author, "phone");
        ActivityPost post = post(author);
        CountDownLatch firstBeforeCommit = new CountDownLatch(1);
        CountDownLatch secondBeforeCommit = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger firstPid = new AtomicInteger();
        AtomicInteger secondPid = new AtomicInteger();
        try (var executor = Executors.newFixedThreadPool(2)) {
            try {
                // When
                var first = executor.submit(() -> heartHeldBeforeCommit(firstReactor, post, firstPid,
                        firstBeforeCommit, release));
                await(firstBeforeCommit);
                var second = executor.submit(() -> heartHeldBeforeCommit(secondReactor, post, secondPid,
                        secondBeforeCommit, release));
                awaitBeforeCommitOrBlocked(secondBeforeCommit, secondPid);
                release.countDown();
                first.get(10, TimeUnit.SECONDS);
                second.get(10, TimeUnit.SECONDS);
            } finally {
                release.countDown();
            }
        }

        // Then
        assertThat(jdbc.queryForObject("select count(*) from activity_post_reaction", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("""
                select count(*) from notifications where read_at is null and deleted_at is null
                """, Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isEqualTo(1);
    }

    /**
     * 좋아요 트랜잭션을 BEFORE_COMMIT 알림 판단까지 마친 뒤 실제 커밋 직전에서 붙잡아 둔다.
     */
    private void heartHeldBeforeCommit(Member reactor, ActivityPost post, AtomicInteger pid,
                                       CountDownLatch beforeCommit, CountDownLatch release) {
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            pid.set(jdbc.queryForObject("select pg_backend_pid()", Integer.class));
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void beforeCompletion() {
                    beforeCommit.countDown();
                    await(release);
                }
            });
            reactionService.addToPost(reactor.getId(), post.getId(), ReactionEmoji.HEART);
        });
    }

    /**
     * 두 번째 좋아요가 알림 판단을 마쳐 커밋 직전에 왔거나, 첫 트랜잭션의 잠금을 기다리기 시작할 때까지 기다린다.
     */
    private void awaitBeforeCommitOrBlocked(CountDownLatch beforeCommit, AtomicInteger pid) throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos();
        while (System.nanoTime() < deadline) {
            if (beforeCommit.getCount() == 0 || pid.get() != 0 && Boolean.TRUE.equals(jdbc.queryForObject(
                    "select cardinality(pg_blocking_pids(?)) > 0", Boolean.class, pid.get()))) {
                return;
            }
            Thread.sleep(10);
        }
        throw new AssertionError("두 번째 좋아요가 커밋 직전에 이르지도, 잠금을 기다리지도 않았습니다.");
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) {
                throw new AssertionError("트랜잭션 실행 신호가 도착하지 않았습니다.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }

    private int groupSequence;

    private ActivityPost post(Member author) {
        groupSequence++;
        Group group = groups.save(Group.createClub("모임" + groupSequence, "함께해요", null, null, null, NOW.minusDays(10)));
        groupMembers.save(GroupMember.createLeader(group, author, NOW.minusDays(10)));
        return posts.save(ActivityPost.create(group, author, "첫 모임", NOW.toLocalDate(), NOW.minusDays(1)));
    }
}
