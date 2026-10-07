package com.project.jarihana.activitypost;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.project.jarihana.activitypost.command.repository.ActivityPostCommandRepository;
import com.project.jarihana.activitypost.command.repository.ActivityPostPhotoCommandRepository;
import com.project.jarihana.activitypost.domain.ActivityPost;
import com.project.jarihana.activitypost.domain.ActivityPostPhoto;
import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.recruitment.query.repository.GroupRecruitmentJpaRepository;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class ActivityPostInteractionAcceptanceTest extends IntegrationTestSupport {

    @Autowired
    private ActivityPostCommandRepository activityPostRepository;

    @Autowired
    private ActivityPostPhotoCommandRepository activityPostPhotoRepository;

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private GroupMemberJpaRepository groupMemberRepository;

    @Autowired
    private GroupRecruitmentJpaRepository groupRecruitmentRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @DisplayName("로그인 회원은 그룹 밖에서도 댓글을 남기고, 누구나 작성 순서대로 댓글을 커서 조회한다.")
    @Test
    void writesCommentsAndListsThemInWritingOrder() {
        // Given
        Group group = saveGroup("댓글 그룹");
        Member author = saveMember("가온", "comment-author");
        Member outsider = saveMember("나래", "comment-outsider");
        saveMemberOf(group, author);
        ActivityPost post = savePost(group, author, "photos/comment.jpg");

        // When
        writeComment(outsider, post.getId(), "  다음 모임에 저도 가고 싶어요  ")
                .then()
                .statusCode(201)
                .body("success", equalTo(true));
        writeComment(author, post.getId(), "언제든 환영해요");

        // Then
        String cursor = given()
                .queryParam("size", 1)
                .when()
                .get("/activity-posts/{postId}/comments", post.getId())
                .then()
                .statusCode(200)
                .body("data.items[0].authorNickname", equalTo("나래"))
                .body("data.items[0].content", equalTo("다음 모임에 저도 가고 싶어요"))
                .body("data.items[0].canDelete", equalTo(false))
                .body("data.items[0].reactions", empty())
                .body("data.hasNext", equalTo(true))
                .extract()
                .path("data.nextCursor");
        given()
                .cookie(authCookieProperties.accessTokenName(), token(author))
                .queryParam("size", 1)
                .queryParam("cursor", cursor)
                .when()
                .get("/activity-posts/{postId}/comments", post.getId())
                .then()
                .statusCode(200)
                .body("data.items[0].content", equalTo("언제든 환영해요"))
                .body("data.items[0].canDelete", equalTo(true))
                .body("data.hasNext", equalTo(false))
                .body("data.nextCursor", nullValue());
        given()
                .when()
                .get("/activity-posts")
                .then()
                .statusCode(200)
                .body("data.items[0].commentCount", equalTo(2));
    }

    @DisplayName("종료된 그룹의 기록에도 댓글과 반응을 남길 수 있다.")
    @Test
    void allowsCommentsAndReactionsOnEndedGroupPosts() {
        // Given
        Group group = saveGroup("종료될 그룹");
        Member author = saveMember("다솜", "ended-author");
        saveMemberOf(group, author);
        ActivityPost post = savePost(group, author, "photos/ended.jpg");
        groupRepository.save(group.endAt(TestSupportConfig.FIXED_NOW.plusDays(2)));

        // When & Then
        writeComment(author, post.getId(), "추억으로 남겨요").then().statusCode(201);
        authorized(author)
                .when()
                .put("/activity-posts/{postId}/reactions/{emoji}", post.getId(), "HEART")
                .then()
                .statusCode(204);
    }

    @DisplayName("댓글 내용이 비었거나 200자를 넘으면 거부하고, 로그인하지 않으면 댓글을 쓸 수 없다.")
    @Test
    void rejectsInvalidOrAnonymousComments() {
        // Given
        Group group = saveGroup("검증 그룹");
        Member author = saveMember("라미", "comment-invalid-author");
        saveMemberOf(group, author);
        ActivityPost post = savePost(group, author, "photos/invalid.jpg");
        String csrfToken = csrfToken();

        // When & Then
        writeComment(author, post.getId(), "   ")
                .then()
                .statusCode(400)
                .body("error.code", equalTo("INVALID_PARAMETER"));
        writeComment(author, post.getId(), "가".repeat(201))
                .then()
                .statusCode(400)
                .body("error.code", equalTo("INVALID_PARAMETER"));
        given()
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("{\"content\": \"익명 댓글\"}")
                .when()
                .post("/activity-posts/{postId}/comments", post.getId())
                .then()
                .statusCode(401);
        given()
                .when()
                .get("/activity-posts/{postId}/comments", 999_999)
                .then()
                .statusCode(404)
                .body("error.code", equalTo("ACTIVITY_POST_NOT_FOUND"));
    }

    @DisplayName("댓글은 작성자와 현재 모임장만 지울 수 있고, 지운 댓글은 목록과 개수에서 빠진다.")
    @Test
    void deletesCommentsByAuthorOrLeaderOnly() {
        // Given
        Group group = saveGroup("삭제 그룹");
        Member leader = saveMember("보미", "comment-delete-leader");
        Member author = saveMember("소라", "comment-delete-author");
        Member other = saveMember("아라", "comment-delete-other");
        groupMemberRepository.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW));
        saveMemberOf(group, author);
        ActivityPost post = savePost(group, author, "photos/delete-comment.jpg");
        int ownCommentId = writeComment(author, post.getId(), "내가 지울 댓글").then().extract().path("data.id");
        int moderatedCommentId = writeComment(other, post.getId(), "모임장이 지울 댓글")
                .then()
                .extract()
                .path("data.id");

        // When & Then
        authorized(other)
                .when()
                .delete("/activity-post-comments/{commentId}", ownCommentId)
                .then()
                .statusCode(403)
                .body("error.code", equalTo("ACTIVITY_POST_COMMENT_ACCESS_DENIED"));
        authorized(author)
                .when()
                .delete("/activity-post-comments/{commentId}", ownCommentId)
                .then()
                .statusCode(204);
        authorized(leader)
                .when()
                .delete("/activity-post-comments/{commentId}", moderatedCommentId)
                .then()
                .statusCode(204);
        authorized(author)
                .when()
                .delete("/activity-post-comments/{commentId}", ownCommentId)
                .then()
                .statusCode(404)
                .body("error.code", equalTo("ACTIVITY_POST_COMMENT_NOT_FOUND"));
        given()
                .when()
                .get("/activity-posts/{postId}/comments", post.getId())
                .then()
                .statusCode(200)
                .body("data.items", empty());
        given()
                .when()
                .get("/activity-posts")
                .then()
                .body("data.items[0].commentCount", equalTo(0));
    }

    @DisplayName("기록에 남긴 이모지 반응은 한 번만 세고, 요청자의 반응 여부와 함께 피드에 보인다.")
    @Test
    void togglesPostReactionsIdempotently() {
        // Given
        Group group = saveGroup("반응 그룹");
        Member author = saveMember("하루", "reaction-author");
        Member reactor = saveMember("모카", "reaction-reactor");
        saveMemberOf(group, author);
        ActivityPost post = savePost(group, author, "photos/reaction.jpg");

        // When
        authorized(reactor).when().put("/activity-posts/{postId}/reactions/{emoji}", post.getId(), "FIRE")
                .then().statusCode(204);
        authorized(reactor).when().put("/activity-posts/{postId}/reactions/{emoji}", post.getId(), "FIRE")
                .then().statusCode(204);
        authorized(author).when().put("/activity-posts/{postId}/reactions/{emoji}", post.getId(), "FIRE")
                .then().statusCode(204);
        authorized(author).when().put("/activity-posts/{postId}/reactions/{emoji}", post.getId(), "THUMBS_UP")
                .then().statusCode(204);

        // Then
        given()
                .cookie(authCookieProperties.accessTokenName(), token(reactor))
                .when()
                .get("/activity-posts")
                .then()
                .statusCode(200)
                .body("data.items[0].reactions.emoji", contains("THUMBS_UP", "FIRE"))
                .body("data.items[0].reactions.count", contains(1, 2))
                .body("data.items[0].reactions.reacted", contains(false, true));
        given()
                .when()
                .get("/activity-posts")
                .then()
                .body("data.items[0].reactions.reacted", contains(false, false));

        authorized(reactor).when().delete("/activity-posts/{postId}/reactions/{emoji}", post.getId(), "FIRE")
                .then().statusCode(204);
        authorized(reactor).when().delete("/activity-posts/{postId}/reactions/{emoji}", post.getId(), "FIRE")
                .then().statusCode(204);
        given()
                .when()
                .get("/activity-posts")
                .then()
                .body("data.items[0].reactions.count", contains(1, 1));
        authorized(reactor).when().put("/activity-posts/{postId}/reactions/{emoji}", post.getId(), "UNKNOWN")
                .then()
                .statusCode(400)
                .body("error.code", equalTo("INVALID_PARAMETER"));
    }

    @DisplayName("댓글에도 이모지 반응을 남기고 지울 수 있다.")
    @Test
    void togglesCommentReactions() {
        // Given
        Group group = saveGroup("댓글 반응 그룹");
        Member author = saveMember("솔빛", "comment-reaction-author");
        Member reactor = saveMember("제이", "comment-reaction-reactor");
        saveMemberOf(group, author);
        ActivityPost post = savePost(group, author, "photos/comment-reaction.jpg");
        int commentId = writeComment(author, post.getId(), "반응을 기다리는 댓글").then().extract().path("data.id");

        // When
        authorized(reactor)
                .when()
                .put("/activity-post-comments/{commentId}/reactions/{emoji}", commentId, "QUESTION")
                .then()
                .statusCode(204);

        // Then
        given()
                .cookie(authCookieProperties.accessTokenName(), token(reactor))
                .when()
                .get("/activity-posts/{postId}/comments", post.getId())
                .then()
                .body("data.items[0].reactions[0].emoji", equalTo("QUESTION"))
                .body("data.items[0].reactions[0].count", equalTo(1))
                .body("data.items[0].reactions[0].reacted", equalTo(true));
        authorized(reactor)
                .when()
                .delete("/activity-post-comments/{commentId}/reactions/{emoji}", commentId, "QUESTION")
                .then()
                .statusCode(204);
        given()
                .when()
                .get("/activity-posts/{postId}/comments", post.getId())
                .then()
                .body("data.items[0].reactions", empty());
    }

    @DisplayName("피드는 그룹의 모집 진행 여부와 요청자의 그룹 소속 여부를 함께 알려 준다.")
    @Test
    void showsRecruitingAndJoinedGroupState() {
        // Given
        Group group = saveGroup("모집 중인 그룹");
        Member member = saveMember("루나", "feed-joined-member");
        Member outsider = saveMember("도토리", "feed-outsider");
        saveMemberOf(group, member);
        savePost(group, member, "photos/recruiting.jpg");
        groupRecruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.APPROVAL,
                10,
                TestSupportConfig.FIXED_NOW.minusDays(1),
                TestSupportConfig.FIXED_NOW.plusDays(5)
        ));

        // When & Then
        given()
                .cookie(authCookieProperties.accessTokenName(), token(member))
                .when()
                .get("/activity-posts")
                .then()
                .body("data.items[0].group.recruiting", equalTo(true))
                .body("data.items[0].group.joined", equalTo(true));
        given()
                .cookie(authCookieProperties.accessTokenName(), token(outsider))
                .when()
                .get("/activity-posts")
                .then()
                .body("data.items[0].group.joined", equalTo(false));
        given()
                .when()
                .get("/activity-posts")
                .then()
                .body("data.items[0].group.recruiting", equalTo(true))
                .body("data.items[0].group.joined", equalTo(false))
                .body("data.items[0].commentCount", equalTo(0))
                .body("data.items[0].reactions", empty());
    }

    private Response writeComment(Member member, long postId, String content) {
        return authorized(member)
                .contentType("application/json")
                .body(Map.of("content", content))
                .when()
                .post("/activity-posts/{postId}/comments", postId);
    }

    private RequestSpecification authorized(Member member) {
        String csrfToken = csrfToken();
        return given()
                .cookie(authCookieProperties.accessTokenName(), token(member))
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken);
    }

    private String token(Member member) {
        return accessTokenProvider.issue(member.getId()).value();
    }

    private Group saveGroup(String name) {
        return groupRepository.save(Group.createStudy(
                name,
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

    private void saveMemberOf(Group group, Member member) {
        groupMemberRepository.save(GroupMember.createMember(group, member, TestSupportConfig.FIXED_NOW));
    }

    private ActivityPost savePost(Group group, Member author, String imageKey) {
        ActivityPost post = activityPostRepository.save(ActivityPost.create(
                group,
                author,
                "함께한 하루",
                LocalDate.of(2026, 8, 18),
                TestSupportConfig.FIXED_NOW
        ));
        activityPostPhotoRepository.save(ActivityPostPhoto.create(post, imageKey));
        return post;
    }

    private String csrfToken() {
        return given()
                .when()
                .get("/activity-posts")
                .then()
                .extract()
                .cookie("XSRF-TOKEN");
    }
}
