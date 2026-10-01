package com.project.jarihana.activitypost;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
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
import com.project.jarihana.image.command.repository.ImageUploadCommandRepository;
import com.project.jarihana.image.domain.ImageUpload;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class ActivityPostAcceptanceTest extends IntegrationTestSupport {

    @Autowired
    private ActivityPostCommandRepository activityPostRepository;

    @Autowired
    private ActivityPostPhotoCommandRepository activityPostPhotoRepository;

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private GroupMemberJpaRepository groupMemberRepository;

    @Autowired
    private ImageUploadCommandRepository imageUploadRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @DisplayName("비로그인 방문자도 사진 활동 기록을 활동 날짜 최신순으로 커서 조회한다.")
    @Test
    void listsPublicPostsByActivityDateAndSupportsMineFilter() {
        Group group = saveGroup("사진 기록 그룹");
        Member author = saveMember("가온", "activity-list-author");
        Member otherAuthor = saveMember("나래", "activity-list-other");
        saveMemberOf(group, author);
        saveMemberOf(group, otherAuthor);
        savePost(group, author, "photos/list-1.jpg", LocalDate.of(2026, 8, 10), "지난 기록");
        savePost(group, otherAuthor, "photos/list-2.jpg", LocalDate.of(2026, 8, 18), "최근 기록");

        ExtractableResponse<Response> firstPage = given()
                .queryParam("size", 1)
                .when()
                .get("/activity-posts")
                .then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.items[0].caption", equalTo("최근 기록"))
                .body("data.items[0].authorNickname", equalTo("나래"))
                .body("data.items[0].imageUrl", equalTo("https://cdn.example.test/images/photos/list-2.jpg"))
                .body("data.items[0].canModify", equalTo(false))
                .body("data.hasNext", equalTo(true))
                .extract();
        String cursor = firstPage.path("data.nextCursor");

        given()
                .queryParam("size", 1)
                .queryParam("cursor", cursor)
                .when()
                .get("/activity-posts")
                .then()
                .statusCode(200)
                .body("data.items[0].caption", equalTo("지난 기록"))
                .body("data.hasNext", equalTo(false))
                .body("data.nextCursor", nullValue());

        String accessToken = accessTokenProvider.issue(author.getId()).value();
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .queryParam("mine", true)
                .when()
                .get("/activity-posts")
                .then()
                .statusCode(200)
                .body("data.items.size()", equalTo(1))
                .body("data.items[0].caption", equalTo("지난 기록"))
                .body("data.items[0].canModify", equalTo(true));
    }

    @DisplayName("활성 그룹 구성원은 사진 기록을 작성하고, 그룹을 나간 뒤에도 본인 글을 수정한다.")
    @Test
    void createsAndModifiesOwnPostAfterLeavingGroup() {
        Group group = saveGroup("활동 작성 그룹");
        Member leader = saveMember("다솜", "activity-create-leader");
        Member author = saveMember("라미", "activity-create-author");
        Member outsider = saveMember("보미", "activity-create-outsider");
        groupMemberRepository.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW));
        saveMemberOf(group, author);
        saveImageUpload("groups/tmp/activity-create.jpg");
        String authorToken = accessTokenProvider.issue(author.getId()).value();
        String csrfToken = csrfToken();

        int postId = given()
                .cookie(authCookieProperties.accessTokenName(), authorToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("""
                        {
                          "imageKey": "groups/tmp/activity-create.jpg",
                          "caption": "함께한 하루",
                          "activityDate": "2026-08-18"
                        }
                        """)
                .when()
                .post("/groups/{groupId}/activity-posts", group.getId())
                .then()
                .statusCode(201)
                .body("success", equalTo(true))
                .extract()
                .path("data.id");

        GroupMember authorMembership = groupMemberRepository.findAllByGroupIdInOrderById(List.of(group.getId()))
                .stream()
                .filter(member -> member.getMember().getId().equals(author.getId()))
                .findFirst()
                .orElseThrow();
        groupMemberRepository.delete(authorMembership);

        given()
                .cookie(authCookieProperties.accessTokenName(), accessTokenProvider.issue(outsider.getId()).value())
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("""
                        {
                          "caption": "수정 권한 없음",
                          "activityDate": "2026-08-18"
                        }
                        """)
                .when()
                .put("/activity-posts/{postId}", postId)
                .then()
                .statusCode(403)
                .body("error.code", equalTo("ACTIVITY_POST_ACCESS_DENIED"));

        given()
                .cookie(authCookieProperties.accessTokenName(), authorToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("""
                        {
                          "caption": "오래 기억할 하루",
                          "activityDate": "2026-08-17"
                        }
                        """)
                .when()
                .put("/activity-posts/{postId}", postId)
                .then()
                .statusCode(200)
                .body("success", equalTo(true));

        given()
                .when()
                .get("/groups/{groupId}/activity-posts", group.getId())
                .then()
                .statusCode(200)
                .body("data.items[0].caption", equalTo("오래 기억할 하루"))
                .body("data.items[0].activityDate", equalTo("2026-08-17"));
    }

    @DisplayName("그룹 삭제 시 사진 기록은 참조만 끊고 숨김 상태로 보존한다.")
    @Test
    void hidesPostsWhenTheirGroupIsDeleted() {
        Group group = saveGroup("삭제될 모임");
        Member leader = saveMember("아라", "activity-group-delete-leader");
        groupMemberRepository.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW));
        ActivityPost post = savePost(
                group,
                leader,
                "photos/delete-group.jpg",
                LocalDate.of(2026, 8, 18),
                "숨겨야 하는 기록"
        );
        String csrfToken = csrfToken();

        given()
                .cookie(authCookieProperties.accessTokenName(), accessTokenProvider.issue(leader.getId()).value())
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .when()
                .delete("/groups/{groupId}", group.getId())
                .then()
                .statusCode(204);

        ActivityPost hiddenPost = activityPostRepository.findById(post.getId()).orElseThrow();
        assertThat(hiddenPost.getDeletedAt()).isNotNull();
        assertThat(hiddenPost.getGroup()).isNull();
        given()
                .when()
                .get("/activity-posts")
                .then()
                .statusCode(200)
                .body("data.items.size()", equalTo(0));
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

    private ActivityPost savePost(Group group, Member author, String imageKey, LocalDate activityDate, String caption) {
        saveImageUpload(imageKey);
        ActivityPost post = activityPostRepository.save(
                ActivityPost.create(group, author, caption, activityDate, TestSupportConfig.FIXED_NOW)
        );
        activityPostPhotoRepository.save(ActivityPostPhoto.create(post, imageKey));
        return post;
    }

    private void saveImageUpload(String imageKey) {
        imageUploadRepository.save(ImageUpload.create(
                UUID.randomUUID(),
                "activity-photo.jpg",
                "image/jpeg",
                1_024,
                imageKey,
                TestSupportConfig.FIXED_NOW.plusMinutes(10),
                TestSupportConfig.FIXED_NOW
        ));
    }

    private String csrfToken() {
        ExtractableResponse<Response> response = given()
                .when()
                .get("/activity-posts")
                .then()
                .extract();
        return response.cookie("XSRF-TOKEN");
    }
}
