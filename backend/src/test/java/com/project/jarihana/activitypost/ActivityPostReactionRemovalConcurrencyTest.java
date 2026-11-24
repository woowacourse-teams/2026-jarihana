package com.project.jarihana.activitypost;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

import com.project.jarihana.activitypost.command.repository.ActivityPostCommandRepository;
import com.project.jarihana.activitypost.command.repository.ActivityPostCommentCommandRepository;
import com.project.jarihana.activitypost.command.repository.ActivityPostCommentReactionCommandRepository;
import com.project.jarihana.activitypost.command.repository.ActivityPostReactionCommandRepository;
import com.project.jarihana.activitypost.command.service.ActivityPostReactionCommandService;
import com.project.jarihana.activitypost.domain.ActivityPost;
import com.project.jarihana.activitypost.domain.ActivityPostComment;
import com.project.jarihana.activitypost.domain.ActivityPostCommentReaction;
import com.project.jarihana.activitypost.domain.ActivityPostReaction;
import com.project.jarihana.activitypost.domain.ReactionEmoji;
import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import io.restassured.specification.RequestSpecification;
import jakarta.persistence.EntityManager;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 같은 회원의 반응 취소 요청이 거의 동시에 두 번 들어오는 경우를 결정적으로 만든다.
 * 먼저 온 요청이 반응 행을 지우고 아직 커밋하지 않은 사이에 늦게 온 요청을 보내면, 늦게 온 요청은 같은 행을 지우려다
 * 먼저 온 요청의 커밋을 기다린다. 더블클릭이나 탭 두 개에서 실제로 생기는 순서와 같다.
 */
class ActivityPostReactionRemovalConcurrencyTest extends IntegrationTestSupport {

    @Autowired
    private ActivityPostReactionCommandService reactionService;

    @Autowired
    private ActivityPostCommandRepository activityPostRepository;

    @Autowired
    private ActivityPostCommentCommandRepository activityPostCommentRepository;

    @Autowired
    private ActivityPostReactionCommandRepository activityPostReactionRepository;

    @Autowired
    private ActivityPostCommentReactionCommandRepository activityPostCommentReactionRepository;

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private JdbcTemplate jdbc;

    @DisplayName("같은 회원의 기록 하트 취소 요청이 겹쳐도 늦게 온 요청은 성공하고, 하트는 남지 않는다.")
    @Test
    void removesPostHeartWhenSameMemberCancelsConcurrently() throws Exception {
        // Given
        Member author = saveMember("가온", "race-remove-post-author");
        Member reactor = saveMember("나래", "race-remove-post-reactor");
        ActivityPost post = savePost(saveGroup(), author);
        activityPostReactionRepository.save(
                ActivityPostReaction.create(post, reactor, ReactionEmoji.HEART, TestSupportConfig.FIXED_NOW)
        );
        RequestSpecification lateRequest = authorized(reactor);

        // When
        int lateStatus = sendWhileEarlierRequestIsUncommitted(
                () -> reactionService.removeFromPost(reactor.getId(), post.getId(), ReactionEmoji.HEART),
                () -> lateRequest.when()
                        .delete("/activity-posts/{postId}/reactions/{emoji}", post.getId(), "HEART")
                        .statusCode()
        );

        // Then
        assertThat(lateStatus).isEqualTo(204);
        assertThat(count("activity_post_reaction")).isZero();
    }

    @DisplayName("같은 회원의 댓글 하트 취소 요청이 겹쳐도 늦게 온 요청은 성공하고, 하트는 남지 않는다.")
    @Test
    void removesCommentHeartWhenSameMemberCancelsConcurrently() throws Exception {
        // Given
        Member author = saveMember("다솜", "race-remove-comment-author");
        Member reactor = saveMember("라온", "race-remove-comment-reactor");
        ActivityPost post = savePost(saveGroup(), author);
        ActivityPostComment comment = activityPostCommentRepository.save(
                ActivityPostComment.create(post, author, "함께해서 좋았어요", TestSupportConfig.FIXED_NOW)
        );
        activityPostCommentReactionRepository.save(
                ActivityPostCommentReaction.create(comment, reactor, ReactionEmoji.HEART, TestSupportConfig.FIXED_NOW)
        );
        RequestSpecification lateRequest = authorized(reactor);

        // When
        int lateStatus = sendWhileEarlierRequestIsUncommitted(
                () -> reactionService.removeFromComment(reactor.getId(), comment.getId(), ReactionEmoji.HEART),
                () -> lateRequest.when()
                        .delete("/activity-post-comments/{commentId}/reactions/{emoji}", comment.getId(), "HEART")
                        .statusCode()
        );

        // Then
        assertThat(lateStatus).isEqualTo(204);
        assertThat(count("activity_post_comment_reaction")).isZero();
    }

    /**
     * 먼저 온 요청의 DELETE를 DB에 보낸 뒤 커밋하지 않은 채로 늦게 온 요청을 보낸다. 엔티티 삭제는 커밋할 때까지
     * 미뤄지므로 flush로 커밋 직전 상태를 만든다. 늦게 온 요청이 행 잠금을 기다리는지는 {@code pg_locks}에 허가되지
     * 않은 잠금이 생겼는지로 본다.
     */
    private int sendWhileEarlierRequestIsUncommitted(Runnable earlierRequest, Callable<Integer> lateRequest)
            throws Exception {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<Integer> late = new TransactionTemplate(transactionManager).execute(status -> {
                earlierRequest.run();
                entityManager.flush();
                Future<Integer> pending = executor.submit(lateRequest);
                Awaitility.await()
                        .atMost(Duration.ofSeconds(5))
                        .untilAsserted(() -> assertThat(jdbc.queryForObject(
                                "select count(*) from pg_locks where not granted",
                                Long.class
                        )).isPositive());
                assertThat(pending).isNotDone();
                return pending;
            });
            return late.get(5, TimeUnit.SECONDS);
        } finally {
            executor.shutdownNow();
        }
    }

    private long count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Long.class);
    }

    private RequestSpecification authorized(Member member) {
        String csrfToken = given()
                .when()
                .get("/activity-posts")
                .then()
                .extract()
                .cookie("XSRF-TOKEN");
        return given()
                .cookie(authCookieProperties.accessTokenName(), accessTokenProvider.issue(member.getId()).value())
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken);
    }

    private Group saveGroup() {
        return groupRepository.save(Group.createStudy(
                "반응 취소 경합 그룹",
                "함께 활동을 기록해요",
                null,
                null,
                RecurringGroupSchedule.of(
                        Set.of(DayOfWeek.MONDAY),
                        LocalTime.of(19, 0),
                        LocalTime.of(21, 0)
                ),
                TestSupportConfig.FIXED_NOW
        ));
    }

    private Member saveMember(String nickname, String githubId) {
        return memberRepository.save(Member.create(nickname, 20, githubId, Course.BACKEND));
    }

    private ActivityPost savePost(Group group, Member author) {
        return activityPostRepository.save(ActivityPost.create(
                group,
                author,
                "함께한 하루",
                LocalDate.of(2026, 8, 18),
                TestSupportConfig.FIXED_NOW
        ));
    }
}
