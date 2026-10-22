package com.project.jarihana.notification;

import com.project.jarihana.activitypost.command.repository.ActivityPostCommandRepository;
import com.project.jarihana.activitypost.command.service.ActivityPostCommentCommandService;
import com.project.jarihana.activitypost.domain.ActivityPost;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;

class ActivityPostCommentNotificationTest extends NotificationIntegrationTestSupport {

    @Autowired private ActivityPostCommentCommandService commentService;
    @Autowired private ActivityPostCommandRepository posts;
    @Autowired private PlatformTransactionManager transactions;

    @Test
    @DisplayName("다른 회원의 댓글은 기록 작성자에게 댓글마다 알림을 남기고 활성 구독별로 전송 대기를 만든다.")
    void notifyPostAuthorForEveryCommentFromOthers() {
        // Given
        Member author = member("101");
        Member commenter = member("102");
        subscription(author, "phone");
        subscription(author, "desktop");
        subscription(commenter, "commenter");
        ActivityPost post = post(author);

        // When
        long first = commentService.create(commenter.getId(), post.getId(), "다음에 저도 갈게요");
        long second = commentService.create(commenter.getId(), post.getId(), "사진 멋져요");

        // Then
        assertThat(jdbc.queryForList("select member_id from notifications", Long.class))
                .containsOnly(author.getId());
        assertThat(jdbc.queryForList("select event_type from notifications", String.class))
                .containsOnly("ACTIVITY_POST_COMMENTED");
        assertThat(jdbc.queryForList("select event_key from notifications", String.class)).containsExactlyInAnyOrder(
                "activity-post-comment:" + first + ":created", "activity-post-comment:" + second + ":created");
        assertThat(jdbc.queryForList("select payload::text from notifications", String.class)).containsOnly(
                "{\"groupId\": " + post.getGroup().getId() + ", \"activityPostId\": " + post.getId() + "}");
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isEqualTo(4);
    }

    @Test
    @DisplayName("기록 작성자가 직접 남긴 댓글과 탈퇴한 작성자의 기록에 남긴 댓글은 알리지 않는다.")
    void skipSelfCommentAndWithdrawnAuthor() {
        // Given
        Member author = member("101");
        Member withdrawn = member("102");
        Member commenter = member("103");
        subscription(author, "author");
        subscription(withdrawn, "withdrawn");
        ActivityPost own = post(author);
        ActivityPost orphaned = post(withdrawn);
        jdbc.update("update member set withdrawn_at = ? where id = ?", NOW, withdrawn.getId());

        // When
        commentService.create(author.getId(), own.getId(), "다들 고마워요");
        commentService.create(commenter.getId(), orphaned.getId(), "멋진 기록이에요");

        // Then
        assertThat(jdbc.queryForObject("select count(*) from activity_post_comment", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isZero();
    }

    @Test
    @DisplayName("댓글 저장이 롤백되면 알림과 전송 대기도 남지 않는다.")
    void rollbackCommentLeavesNoNotifications() {
        // Given
        Member author = member("101");
        Member commenter = member("102");
        subscription(author, "author");
        ActivityPost post = post(author);

        // When
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            commentService.create(commenter.getId(), post.getId(), "잘 봤어요");
            status.setRollbackOnly();
        });

        // Then
        assertThat(jdbc.queryForObject("select count(*) from activity_post_comment", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isZero();
    }

    private ActivityPost post(Member author) {
        Group group = groups.save(Group.createClub("모임" + author.getId(), "함께해요", null, null, null, NOW.minusDays(10)));
        groupMembers.save(GroupMember.createLeader(group, author, NOW.minusDays(10)));
        return posts.save(ActivityPost.create(group, author, "첫 모임", NOW.toLocalDate(), NOW.minusDays(1)));
    }
}
