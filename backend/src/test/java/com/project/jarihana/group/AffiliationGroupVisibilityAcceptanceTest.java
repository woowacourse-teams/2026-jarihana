package com.project.jarihana.group;

import com.project.jarihana.activitypost.command.repository.ActivityPostCommandRepository;
import com.project.jarihana.activitypost.command.repository.ActivityPostPhotoCommandRepository;
import com.project.jarihana.activitypost.domain.ActivityPost;
import com.project.jarihana.activitypost.domain.ActivityPostPhoto;
import com.project.jarihana.announcement.command.repository.AnnouncementCommandRepository;
import com.project.jarihana.announcement.domain.Announcement;
import com.project.jarihana.announcement.domain.AnnouncementScope;
import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupVisibility;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.group.query.repository.RegistrationJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberAffiliationRepository;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Affiliation;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.member.domain.VerifiedAffiliations;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.recruitment.query.repository.GroupRecruitmentJpaRepository;
import com.project.jarihana.registration.domain.DecisionActor;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.path.json.JsonPath;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static com.project.jarihana.support.TestSupportConfig.FIXED_NOW;
import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;

/**
 * 소속 공개 모임은 모임이 정한 소속의 회원과 그 모임의 현재 구성원에게만 보인다.
 *
 * <p>각 테스트는 같은 모임을 만든다. 모임장과 크루 한 명은 우아한테크코스 소속이다. 공개 상태에서 소속 밖 외부인에게
 * 지정 초대와 알림, 미승인된 신청을 남기고, 소속 밖 회원 한 명을 구성원으로 들인 뒤 우아한테크코스 소속 공개로 바꾼다.
 */
class AffiliationGroupVisibilityAcceptanceTest extends IntegrationTestSupport {

    private static final String GROUP_NAME = "크루 전용 스터디";

    @Autowired private GroupJpaRepository groups;
    @Autowired private GroupMemberJpaRepository groupMembers;
    @Autowired private GroupRecruitmentJpaRepository recruitments;
    @Autowired private RegistrationJpaRepository registrations;
    @Autowired private ActivityPostCommandRepository posts;
    @Autowired private ActivityPostPhotoCommandRepository photos;
    @Autowired private AnnouncementCommandRepository announcements;
    @Autowired private MemberRepository members;
    @Autowired private MemberAffiliationRepository memberAffiliations;
    @Autowired private AccessTokenProvider accessTokens;
    @Autowired private AuthCookieProperties cookies;
    @Autowired private JdbcTemplate jdbc;

    private Member leader;
    private Member crew;
    private Member outsider;
    private Member insider;
    private Group group;
    private GroupRecruitment recruitment;
    private ActivityPost post;
    private long commentId;
    private long announcementId;
    private long directInvitationId;
    private long linkInvitationId;
    private String linkToken;
    private String csrf;

    @DynamicPropertySource
    static void invitationTokenKeys(DynamicPropertyRegistry registry) {
        registry.add("jarihana.invitation.token.active-key-id", () -> "test");
        registry.add("jarihana.invitation.token.keys.test", () -> "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    }

    @BeforeEach
    void givenAffiliationGroup() {
        csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        leader = members.save(Member.create("가온", 8, "crew-only-leader", Course.BACKEND));
        crew = members.save(Member.create("나래", 8, "crew-only-crew", Course.FRONTEND));
        memberAffiliations.insertIfAbsent(leader.getId(), Affiliation.WOOTECO_CODE, FIXED_NOW);
        memberAffiliations.insertIfAbsent(crew.getId(), Affiliation.WOOTECO_CODE, FIXED_NOW);
        long woowaAffiliationId = memberAffiliations.findAffiliationIdsByMemberId(leader.getId()).getFirst();
        outsider = members.save(Member.createBasic("다솜", "crew-only-outsider"));
        insider = members.save(Member.createBasic("라온", "crew-only-insider"));

        group = groups.save(Group.createStudy(GROUP_NAME, "크루끼리 공부해요", null, null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.MONDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)),
                FIXED_NOW.minusDays(3)));
        groupMembers.save(GroupMember.createLeader(group, leader, FIXED_NOW.minusDays(3)));
        groupMembers.save(GroupMember.createMember(group, insider, FIXED_NOW.minusDays(2)));
        recruitment = recruitments.save(GroupRecruitment.create(group, JoinMethod.APPROVAL, 10,
                FIXED_NOW.minusDays(1), FIXED_NOW.plusDays(7)));
        Registration pending = registrations.save(
                Registration.createPending(recruitment, outsider, "참여하고 싶어요", FIXED_NOW.minusHours(5)));
        registrations.save(pending.reject(DecisionActor.member(leader.getId()), null, FIXED_NOW.minusHours(4)));

        post = posts.save(ActivityPost.create(group, leader, "첫 모임", LocalDate.of(2026, 8, 18), FIXED_NOW.minusHours(3)));
        photos.save(ActivityPostPhoto.create(post, "photos/crew-only.jpg"));
        commentId = ((Number) as(leader).contentType("application/json").body(Map.of("content", "다음 주에 봐요"))
                .post("/activity-posts/{postId}/comments", post.getId())
                .then().statusCode(201).extract().path("data.id")).longValue();
        as(leader).put("/activity-posts/{postId}/reactions/HEART", post.getId()).then().statusCode(204);
        announcementId = announcements.save(Announcement.create(group, leader, "공지", "모두 보세요",
                AnnouncementScope.PUBLIC, FIXED_NOW.minusHours(2))).getId();

        directInvitationId = issueInvitation(Map.of("type", "DIRECT", "targetMemberId", outsider.getId(),
                "requestId", UUID.randomUUID().toString())).getLong("data.id");
        var link = issueInvitation(Map.of("type", "LINK", "requestId", UUID.randomUUID().toString()));
        linkInvitationId = link.getLong("data.id");
        String sharePath = link.getString("data.sharePath");
        linkToken = sharePath.substring(sharePath.lastIndexOf('/') + 1);

        group = groups.save(groups.findById(group.getId()).orElseThrow()
                .changeVisibility(GroupVisibility.AFFILIATION_ONLY, woowaAffiliationId,
                        VerifiedAffiliations.of(woowaAffiliationId)));
    }

    @DisplayName("소속 공개 모임은 비로그인 사용자와 소속 밖 외부인의 목록, 검색, 홈에서 빠진다.")
    @Test
    void hidesAffiliationGroupFromListsForOutsiders() {
        // When & Then
        for (RequestSpecification viewer : List.of(anonymous(), as(outsider))) {
            viewer.get("/groups?size=20").then().statusCode(200)
                    .body("data.items.name", not(hasItem(GROUP_NAME)));
        }
        as(outsider).get("/groups?size=20&keyword=크루 전용").then().statusCode(200)
                .body("data.items.size()", equalTo(0));
        anonymous().get("/home").then().statusCode(200)
                .body("data.recruiting.items.name", not(hasItem(GROUP_NAME)));

        for (Member viewer : List.of(crew, insider, leader)) {
            as(viewer).get("/groups?size=20&keyword=크루 전용").then().statusCode(200)
                    .body("data.items.name", hasItem(GROUP_NAME))
                    .body("data.items.visibility", hasItem("AFFILIATION_ONLY"));
        }
        as(crew).get("/home").then().statusCode(200)
                .body("data.recruiting.items.name", hasItem(GROUP_NAME));
    }

    @DisplayName("소속 공개 모임과 그 하위 조회는 외부인에게 없는 모임처럼 404로 응답하고, 같은 소속 회원과 현재 구성원에게는 보인다.")
    @Test
    void returnsNotFoundForEverySubResourceToOutsiders() {
        // Given
        long groupId = group.getId();
        List<String> paths = List.of(
                "/groups/" + groupId,
                "/groups/" + groupId + "/members",
                "/groups/" + groupId + "/recruitments",
                "/groups/" + groupId + "/recruitments/" + recruitment.getId(),
                "/groups/" + groupId + "/calendar?from=2026-08-17&to=2026-08-23",
                "/groups/" + groupId + "/space",
                "/groups/" + groupId + "/music",
                "/groups/" + groupId + "/announcements",
                "/groups/" + groupId + "/announcements/" + announcementId,
                "/groups/" + groupId + "/activity-posts"
        );

        // When & Then
        for (String path : paths) {
            anonymous().get(path).then().statusCode(404).body("error.code", equalTo("GROUP_NOT_FOUND"));
            as(outsider).get(path).then().statusCode(404).body("error.code", equalTo("GROUP_NOT_FOUND"));
            as(crew).get(path).then().statusCode(200);
            as(insider).get(path).then().statusCode(200);
        }
        as(crew).get("/groups/{groupId}", groupId).then()
                .body("data.visibility", equalTo("AFFILIATION_ONLY"))
                .body("data.visibleAffiliation.name", equalTo("우아한테크코스"));
        as(outsider).get("/groups/{groupId}/music/events", groupId).then().statusCode(404)
                .body("error.code", equalTo("GROUP_NOT_FOUND"));
    }

    @DisplayName("모임원 전용 조회도 외부인에게는 권한 오류 대신 404로 응답한다.")
    @Test
    void returnsNotFoundInsteadOfForbiddenForMemberOnlyReads() {
        // Given
        long groupId = group.getId();

        // When & Then
        for (String path : List.of(
                "/groups/" + groupId + "/calendar/schedule-details?kind=RECURRING&date=2026-08-17",
                "/groups/" + groupId + "/events/1",
                "/groups/" + groupId + "/recurring-schedule/manage",
                "/groups/" + groupId + "/recurring-schedule/periods/1",
                "/groups/" + groupId + "/registrations/summary",
                "/groups/" + groupId + "/invitations?scope=MINE",
                "/groups/" + groupId + "/invitation-candidates")) {
            as(outsider).get(path).then().statusCode(404).body("error.code", equalTo("GROUP_NOT_FOUND"));
        }
        as(outsider).get("/recruitments/{id}/registrations", recruitment.getId()).then().statusCode(404)
                .body("error.code", equalTo("RECRUITMENT_NOT_FOUND"));
        as(leader).get("/recruitments/{id}/registrations", recruitment.getId()).then().statusCode(200);
    }

    @DisplayName("모임원 전용 명령도 보이지 않는 외부인에게는 권한 오류 대신 404로 응답한다.")
    @Test
    void returnsNotFoundForCommandsOnHiddenGroup() {
        // Given
        long groupId = group.getId();

        // When & Then
        as(outsider).contentType("application/json").body(Map.of("title", "공지", "content", "내용", "scope", "PUBLIC"))
                .post("/groups/{id}/announcements", groupId)
                .then().statusCode(404).body("error.code", equalTo("GROUP_NOT_FOUND"));
        as(outsider).delete("/groups/{id}", groupId)
                .then().statusCode(404).body("error.code", equalTo("GROUP_NOT_FOUND"));
        as(outsider).delete("/activity-post-comments/{id}", commentId)
                .then().statusCode(404).body("error.code", equalTo("ACTIVITY_POST_COMMENT_NOT_FOUND"));
        as(crew).delete("/groups/{id}", groupId)
                .then().statusCode(403).body("error.code", equalTo("GROUP_ACCESS_DENIED"));
    }

    @DisplayName("소속 공개 모임의 활동 기록은 전체 피드에서 빠지고 댓글, 반응 조회와 남기기도 외부인에게 404다.")
    @Test
    void hidesActivityPostsFromOutsiders() {
        // When & Then
        anonymous().get("/activity-posts").then().statusCode(200)
                .body("data.items.group.name", not(hasItem(GROUP_NAME)));
        as(crew).get("/activity-posts").then().statusCode(200)
                .body("data.items.group.name", hasItem(GROUP_NAME));

        for (String path : List.of(
                "/activity-posts/" + post.getId() + "/comments",
                "/activity-posts/" + post.getId() + "/reactions/HEART")) {
            as(outsider).get(path).then().statusCode(404).body("error.code", equalTo("ACTIVITY_POST_NOT_FOUND"));
            as(crew).get(path).then().statusCode(200);
        }
        as(outsider).get("/activity-post-comments/{id}/reactions/HEART", commentId).then().statusCode(404)
                .body("error.code", equalTo("ACTIVITY_POST_COMMENT_NOT_FOUND"));

        as(outsider).contentType("application/json").body(Map.of("content", "저도요"))
                .post("/activity-posts/{postId}/comments", post.getId())
                .then().statusCode(404).body("error.code", equalTo("ACTIVITY_POST_NOT_FOUND"));
        as(outsider).put("/activity-posts/{postId}/reactions/HEART", post.getId())
                .then().statusCode(404).body("error.code", equalTo("ACTIVITY_POST_NOT_FOUND"));
        as(outsider).put("/activity-post-comments/{id}/reactions/HEART", commentId)
                .then().statusCode(404).body("error.code", equalTo("ACTIVITY_POST_COMMENT_NOT_FOUND"));
        as(crew).contentType("application/json").body(Map.of("content", "크루도 응원해요"))
                .post("/activity-posts/{postId}/comments", post.getId())
                .then().statusCode(201);
    }

    @DisplayName("소속 밖 외부인은 소속 공개 모임에 신청할 수 없고, 같은 소속은 신청할 수 있다.")
    @Test
    void rejectsRegistrationFromOutsideAffiliation() {
        // Given
        Member newcomer = members.save(Member.createBasic("마루", "crew-only-newcomer"));

        // When & Then
        as(newcomer).contentType("application/json").body(Map.of("message", "참여하고 싶어요"))
                .post("/recruitments/{id}/registrations", recruitment.getId())
                .then().statusCode(404).body("error.code", equalTo("RECRUITMENT_NOT_FOUND"));
        as(crew).contentType("application/json").body(Map.of("message", "참여하고 싶어요"))
                .post("/recruitments/{id}/registrations", recruitment.getId())
                .then().statusCode(201);
        as(crew).get("/registrations?applicant=me&size=20").then().statusCode(200)
                .body("data.items.size()", equalTo(1));
    }

    @DisplayName("다른 소속으로 확인된 회원에게도 보이지 않고, 모임이 정한 소속을 얻은 뒤에는 보인다.")
    @Test
    void showsGroupOnlyToMembersOfItsAffiliation() {
        // Given
        jdbc.update("insert into affiliation (code, name) values ('OTHER_SCHOOL', '다른 학교') on conflict (code) do nothing");
        Member otherAffiliation = members.save(Member.createBasic("마루", "affiliation-other"));
        memberAffiliations.insertIfAbsent(otherAffiliation.getId(), "OTHER_SCHOOL", FIXED_NOW);

        // When & Then
        as(otherAffiliation).get("/groups/{id}", group.getId()).then().statusCode(404);
        as(otherAffiliation).get("/groups?size=20").then().statusCode(200)
                .body("data.items.name", not(hasItem(GROUP_NAME)));

        memberAffiliations.insertIfAbsent(otherAffiliation.getId(), Affiliation.WOOTECO_CODE, FIXED_NOW);
        as(otherAffiliation).get("/groups/{id}", group.getId()).then().statusCode(200)
                .body("data.visibleAffiliation.name", equalTo("우아한테크코스"));
    }

    @DisplayName("소속 공개로 바뀌기 전에 남은 소속 밖 회원의 대기 신청은 모임장이 재량으로 승인할 수 있다.")
    @Test
    void leaderDecidesEarlierPendingRegistrationFromOutsider() {
        // Given
        Member applicant = members.save(Member.createBasic("마루", "crew-only-applicant"));
        Registration pending = registrations.save(
                Registration.createPending(recruitment, applicant, "전부터 기다렸어요", FIXED_NOW.minusHours(6)));
        as(applicant).get("/groups/{id}", group.getId()).then().statusCode(404);

        // When
        as(leader).contentType("application/json").body(Map.of("status", "APPROVED"))
                .patch("/recruitments/{rid}/registrations/{id}", recruitment.getId(), pending.getId())
                .then().statusCode(200);

        // Then
        as(applicant).get("/groups/{id}", group.getId()).then().statusCode(200)
                .body("data.currentMemberRole", equalTo("MEMBER"));
    }

    @DisplayName("소속 공개로 바뀌기 전의 신청, 초대, 알림도 소속 밖 외부인에게는 숨긴다.")
    @Test
    void hidesEarlierRegistrationsInvitationsAndNotificationsFromOutsiders() {
        // When & Then
        as(outsider).get("/registrations?applicant=me&size=20").then().statusCode(200)
                .body("data.items.size()", equalTo(0));
        as(outsider).get("/invitations/received?size=20").then().statusCode(200)
                .body("data.items.size()", equalTo(0));
        as(outsider).get("/invitations/{id}", directInvitationId).then().statusCode(404)
                .body("error.code", equalTo("INVITATION_NOT_FOUND"));
        as(outsider).get("/notifications?size=20").then().statusCode(200)
                .body("data.items.size()", equalTo(0));
        as(outsider).get("/notifications/unread-count").then().statusCode(200)
                .body("data.unreadCount", equalTo(0));
    }

    @DisplayName("소속 공개 모임의 초대는 같은 소속만 미리 보고 수락할 수 있다.")
    @Test
    void allowsOnlySameAffiliationToUseInvitations() {
        // When & Then
        anonymous().get("/invitations/links/{token}", linkToken).then().statusCode(404)
                .body("error.code", equalTo("INVITATION_NOT_FOUND"));
        as(outsider).get("/invitations/links/{token}", linkToken).then().statusCode(404);
        as(outsider).contentType("application/json").body(Map.of("token", linkToken))
                .post("/invitations/{id}/acceptances", linkInvitationId)
                .then().statusCode(404).body("error.code", equalTo("INVITATION_NOT_FOUND"));
        as(outsider).contentType("application/json").body(Map.of())
                .post("/invitations/{id}/acceptances", directInvitationId)
                .then().statusCode(404).body("error.code", equalTo("INVITATION_NOT_FOUND"));
        as(outsider).patch("/invitations/{id}/decline", directInvitationId)
                .then().statusCode(404).body("error.code", equalTo("INVITATION_NOT_FOUND"));

        as(crew).get("/invitations/links/{token}", linkToken).then().statusCode(200);
        as(crew).contentType("application/json").body(Map.of("token", linkToken))
                .post("/invitations/{id}/acceptances", linkInvitationId)
                .then().statusCode(201);
        as(crew).get("/groups/{id}/members?size=20", group.getId()).then().statusCode(200)
                .body("data.items.crewName", hasItem("나래"));
    }

    @DisplayName("소속 공개 모임의 지정 초대 후보에는 같은 소속만 나오고, 소속 밖 회원을 지정해 초대할 수 없다.")
    @Test
    void invitesOnlySameAffiliationToGroup() {
        // When & Then
        as(leader).get("/groups/{id}/invitation-candidates?size=20", group.getId()).then().statusCode(200)
                .body("data.items.memberType", everyItem(equalTo("CREW")))
                .body("data.items.crewName", hasItem("나래"));
        Member another = members.save(Member.createBasic("바다", "crew-only-another"));
        as(leader).contentType("application/json")
                .body(Map.of("type", "DIRECT", "targetMemberId", another.getId(),
                        "requestId", UUID.randomUUID().toString()))
                .post("/groups/{id}/invitations", group.getId())
                .then().statusCode(400).body("error.code", equalTo("INVALID_PARAMETER"));
    }

    @DisplayName("소속 공개로 바뀌기 전에 들어온 소속 밖 구성원은 계속 모임과 기록을 본다.")
    @Test
    void keepsExistingOutsideMembersInside() {
        // When & Then
        as(insider).get("/groups?size=20&relation=JOINED").then().statusCode(200)
                .body("data.items.name", hasItem(GROUP_NAME));
        as(insider).get("/activity-posts").then().statusCode(200)
                .body("data.items.group.name", hasItem(GROUP_NAME));
        as(insider).get("/activity-posts/{postId}/comments", post.getId()).then().statusCode(200);
        as(insider).get("/groups/{id}/members?size=20", group.getId()).then().statusCode(200)
                .body("data.items.crewName", hasItem("라온"));
    }

    @DisplayName("공유 미리보기는 소속 공개 모임의 이름과 소개를 담지 않고 모임 페이지로 넘기기만 한다.")
    @Test
    void rendersGenericSharePreviewForAffiliationGroup() {
        // When & Then
        for (RequestSpecification viewer : List.of(anonymous(), as(crew))) {
            String html = viewer.get("/share/groups/{id}", group.getId())
                    .then().statusCode(200).extract().asString();
            assertThat(html)
                    .doesNotContain(GROUP_NAME)
                    .doesNotContain("크루끼리 공부해요")
                    .contains("<meta property=\"og:title\" content=\"자리하나\"")
                    .contains("/groups/" + group.getId() + "?preview=1");
        }
    }

    @Test
    void hidesPrivateGroupsFromAllNonMembers() {
        makePrivate();

        for (Member viewer : List.of(crew, outsider)) {
            as(viewer).get("/groups?size=20").then().statusCode(200)
                    .body("data.items.name", not(hasItem(GROUP_NAME)));
            as(viewer).get("/home").then().statusCode(200)
                    .body("data.recruiting.items.name", not(hasItem(GROUP_NAME)));
            as(viewer).get("/groups/{id}", group.getId()).then().statusCode(404);
            as(viewer).get("/activity-posts").then().statusCode(200)
                    .body("data.items.group.name", not(hasItem(GROUP_NAME)));
        }
        anonymous().get("/groups/{id}", group.getId()).then().statusCode(404);
        as(insider).get("/groups/{id}", group.getId()).then().statusCode(200)
                .body("data.visibility", equalTo("PRIVATE"));
        String preview = anonymous().get("/share/groups/{id}", group.getId())
                .then().statusCode(200).extract().asString();
        assertThat(preview).doesNotContain(GROUP_NAME, "크루끼리 공부해요");
    }

    @Test
    void letsOnlyPrivateInviteesViewAndAcceptInvitations() {
        makePrivate();
        as(crew).get("/invitations/{id}", directInvitationId).then().statusCode(404);
        as(crew).get("/invitations/{id}", linkInvitationId).then().statusCode(404);
        as(crew).contentType("application/json").body(Map.of())
                .post("/invitations/{id}/acceptances", linkInvitationId).then().statusCode(404);
        as(outsider).get("/invitations/received?size=20").then().statusCode(200)
                .body("data.items.size()", equalTo(1));
        as(outsider).get("/notifications/unread-count").then().statusCode(200)
                .body("data.unreadCount", equalTo(1));
        as(outsider).get("/invitations/{id}", directInvitationId).then().statusCode(200)
                .body("data.group.introduction", equalTo(""));
        as(outsider).contentType("application/json").body(Map.of())
                .post("/invitations/{id}/acceptances", directInvitationId).then().statusCode(201);
        as(outsider).get("/groups/{id}", group.getId()).then().statusCode(200);

        Member linkInvitee = members.save(Member.createBasic("마루", "private-link-invitee"));
        anonymous().get("/invitations/links/{token}", linkToken).then().statusCode(200)
                .body("data.group.introduction", equalTo(""));
        as(linkInvitee).contentType("application/json").body(Map.of("token", linkToken))
                .post("/invitations/{id}/acceptances", linkInvitationId).then().statusCode(201);
        as(linkInvitee).get("/groups/{id}", group.getId()).then().statusCode(200);
    }

    @Test
    void preventsRegistrationJoinAfterTurningPrivate() {
        Registration pending = registrations.save(
                Registration.createPending(recruitment, crew, "참여하고 싶어요", FIXED_NOW.minusHours(6)));
        makePrivate();
        as(crew).get("/registrations?applicant=me&size=20").then().statusCode(200)
                .body("data.items.size()", equalTo(0));
        as(outsider).contentType("application/json").body(Map.of("message", "참여하고 싶어요"))
                .post("/recruitments/{id}/registrations", recruitment.getId()).then().statusCode(404);
        as(leader).contentType("application/json").body(Map.of("status", "APPROVED"))
                .patch("/recruitments/{rid}/registrations/{id}", recruitment.getId(), pending.getId())
                .then().statusCode(403).body("error.code", equalTo("REGISTRATION_ACCESS_DENIED"));
    }

    private void makePrivate() {
        group = groups.save(groups.findById(group.getId()).orElseThrow()
                .changeVisibility(GroupVisibility.PRIVATE, null, VerifiedAffiliations.none()));
    }

    private JsonPath issueInvitation(Map<String, Object> body) {
        return as(leader).contentType("application/json").body(body)
                .post("/groups/{id}/invitations", group.getId())
                .then().statusCode(201).extract().jsonPath();
    }

    private RequestSpecification anonymous() {
        return given().cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf);
    }

    private RequestSpecification as(Member member) {
        return given().cookie(cookies.accessTokenName(), accessTokens.issue(member.getId()).value())
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf);
    }
}
