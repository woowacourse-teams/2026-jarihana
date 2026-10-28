package com.project.jarihana.announcement;

import com.project.jarihana.announcement.command.repository.AnnouncementCommandRepository;
import com.project.jarihana.announcement.domain.Announcement;
import com.project.jarihana.announcement.domain.AnnouncementScope;
import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.domain.Notification;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import com.project.jarihana.pushsubscription.command.repository.PushSubscriptionCommandRepository;
import com.project.jarihana.pushsubscription.domain.PushSubscription;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import io.restassured.RestAssured;
import io.restassured.response.Response;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class AnnouncementAcceptanceTest extends IntegrationTestSupport {

    private static final String PUBLIC_KEY = Base64.getUrlEncoder().withoutPadding().encodeToString(HexFormat.of().parseHex(
            "046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"
                    + "4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5"));
    private static final String AUTH_KEY = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]);

    @Autowired private AnnouncementCommandRepository announcements;
    @Autowired private GroupJpaRepository groups;
    @Autowired private GroupMemberCommandRepository groupMembers;
    @Autowired private MemberRepository members;
    @Autowired private PushSubscriptionCommandRepository subscriptions;
    @Autowired private AccessTokenProvider tokens;
    @Autowired private AuthCookieProperties cookies;
    @Autowired private JdbcTemplate jdbc;

    @Test
    @DisplayName("모임원 공개 공지는 현재 구성원에게만 보이고 전체 공개 공지는 비로그인 방문자에게도 보인다.")
    void filtersAnnouncementScopeForListAndDetail() {
        Group group = saveGroup("공지 공개 범위 모임");
        Member leader = saveMember("공개방장", "announcement-scope-leader");
        Member member = saveMember("공개회원", "announcement-scope-member");
        saveLeader(group, leader);
        saveMemberOf(group, member);
        Announcement membersOnly = announcements.save(Announcement.create(group, leader, "모임원 공지", "구성원 본문",
                AnnouncementScope.MEMBERS, TestSupportConfig.FIXED_NOW.minusMinutes(1)));
        Announcement publicNotice = announcements.save(Announcement.create(group, leader, "전체 공지", "공개 본문",
                AnnouncementScope.PUBLIC, TestSupportConfig.FIXED_NOW));

        Response visitorList = RestAssured.get("/groups/{groupId}/announcements", group.getId());
        Response memberList = authenticated(member).get("/groups/{groupId}/announcements", group.getId());
        Response visitorPrivateDetail = RestAssured.get("/groups/{groupId}/announcements/{announcementId}",
                group.getId(), membersOnly.getId());
        Response visitorPublicDetail = RestAssured.get("/groups/{groupId}/announcements/{announcementId}",
                group.getId(), publicNotice.getId());

        assertThat(visitorList.statusCode()).isEqualTo(200);
        assertThat(visitorList.header("Cache-Control")).contains("no-store");
        assertThat(visitorList.jsonPath().getList("data.items.title", String.class)).containsExactly("전체 공지");
        assertThat(visitorList.asString()).doesNotContain("공개 본문", "구성원 본문");
        assertThat(memberList.jsonPath().getList("data.items.title", String.class))
                .containsExactly("전체 공지", "모임원 공지");
        assertThat(visitorPrivateDetail.statusCode()).isEqualTo(404);
        assertThat(visitorPrivateDetail.jsonPath().getString("error.code")).isEqualTo("ANNOUNCEMENT_NOT_FOUND");
        assertThat(visitorPublicDetail.statusCode()).isEqualTo(200);
        assertThat(visitorPublicDetail.header("Cache-Control")).contains("no-store");
        assertThat(visitorPublicDetail.jsonPath().getString("data.content")).isEqualTo("공개 본문");
    }

    @Test
    @DisplayName("모임장이 공지를 등록하면 현재 구성원에게 알림함 항목을 만들고 활성 구독에만 푸시를 대기한다.")
    void createsAnnouncementAndNotifiesCurrentMembers() {
        Group group = saveGroup("공지 알림 모임");
        Member leader = saveMember("공지방장", "announcement-notification-leader");
        Member member = saveMember("공지회원", "announcement-notification-member");
        Member outsider = saveMember("외부회원", "announcement-notification-outsider");
        saveLeader(group, leader);
        saveMemberOf(group, member);
        subscriptions.save(PushSubscription.create(member, "https://fcm.googleapis.com/announcement-member", PUBLIC_KEY,
                AUTH_KEY, TestSupportConfig.FIXED_NOW));
        subscriptions.save(PushSubscription.create(outsider, "https://fcm.googleapis.com/announcement-outsider", PUBLIC_KEY,
                AUTH_KEY, TestSupportConfig.FIXED_NOW));
        String csrf = csrfToken();

        Response created = mutation(leader, csrf).contentType("application/json").body("""
                {"title":"이번 주 모임 안내","content":"장소가 변경되었습니다.","scope":"PUBLIC"}
                """).post("/groups/{groupId}/announcements", group.getId());

        assertThat(created.statusCode()).isEqualTo(201);
        long announcementId = created.jsonPath().getLong("data.id");
        Response memberInbox = authenticated(member).queryParam("clientVersion", 2).get("/notifications");
        Response leaderInbox = authenticated(leader).queryParam("clientVersion", 2).get("/notifications");
        Response outsiderInbox = authenticated(outsider).queryParam("clientVersion", 2).get("/notifications");

        assertThat(memberInbox.statusCode()).isEqualTo(200);
        assertThat(memberInbox.jsonPath().getList("data.items")).hasSize(1);
        assertThat(memberInbox.jsonPath().getString("data.items[0].eventType")).isEqualTo("GROUP_ANNOUNCEMENT_CREATED");
        assertThat(memberInbox.jsonPath().getString("data.items[0].target.kind")).isEqualTo("GROUP_ANNOUNCEMENT");
        assertThat(memberInbox.jsonPath().getLong("data.items[0].target.groupId")).isEqualTo(group.getId());
        assertThat(memberInbox.jsonPath().getLong("data.items[0].target.announcementId")).isEqualTo(announcementId);
        assertThat(memberInbox.asString()).doesNotContain("장소가 변경되었습니다.", "이번 주 모임 안내");
        assertThat(leaderInbox.jsonPath().getList("data.items")).isEmpty();
        assertThat(outsiderInbox.jsonPath().getList("data.items")).isEmpty();

        long notificationId = memberInbox.jsonPath().getLong("data.items[0].id");
        long subscriptionId = jdbc.queryForObject("select id from push_subscriptions where member_id = ?", Long.class, member.getId());
        Response pushContent = authenticated(member).queryParam("subscriptionId", subscriptionId)
                .queryParam("generation", 1).queryParam("clientVersion", 2)
                .get("/notifications/{notificationId}/push-content", notificationId);
        Integer deliveryCount = jdbc.queryForObject("""
                select count(*) from notification_deliveries delivery
                join notifications notification on notification.id = delivery.notification_id
                where notification.id = ? and delivery.status = ?
                """, Integer.class, notificationId, DeliveryStatus.PENDING.name());

        assertThat(pushContent.statusCode()).isEqualTo(200);
        assertThat(pushContent.jsonPath().getString("data.eventType")).isEqualTo("GROUP_ANNOUNCEMENT_CREATED");
        assertThat(pushContent.jsonPath().getMap("data.payload")).containsOnlyKeys("groupId", "announcementId");
        assertThat(pushContent.jsonPath().getLong("data.payload.announcementId")).isEqualTo(announcementId);
        assertThat(deliveryCount).isEqualTo(1);
    }

    @Test
    @DisplayName("비로그인 방문자와 일반 구성원은 공지를 등록할 수 없고 종료된 모임의 방장도 새 공지를 등록할 수 없다.")
    void rejectsAnnouncementCreationWithoutAuthenticationLeaderOrActiveGroup() {
        Group group = saveGroup("공지 권한 모임");
        Member leader = saveMember("권한방장", "announcement-permission-leader");
        Member member = saveMember("권한회원", "announcement-permission-member");
        saveLeader(group, leader);
        saveMemberOf(group, member);
        String csrf = csrfToken();
        String body = """
                {"title":"공지","content":"내용","scope":"MEMBERS"}
                """;

        Response visitor = RestAssured.given().cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json").body(body)
                .post("/groups/{groupId}/announcements", group.getId());
        Response nonLeader = mutation(member, csrf).contentType("application/json").body(body)
                .post("/groups/{groupId}/announcements", group.getId());
        Group endedGroup = saveGroup("종료 공지 모임");
        Member endedLeader = saveMember("종료방장", "announcement-ended-leader");
        saveLeader(endedGroup, endedLeader);
        jdbc.update("update groups set created_at = ? where id = ?",
                TestSupportConfig.FIXED_NOW.minusDays(3), endedGroup.getId());
        endedGroup = groups.findById(endedGroup.getId()).orElseThrow();
        endedGroup = groups.save(endedGroup.endAt(TestSupportConfig.FIXED_NOW));
        Response ended = mutation(endedLeader, csrf).contentType("application/json").body(body)
                .post("/groups/{groupId}/announcements", endedGroup.getId());

        assertThat(visitor.statusCode()).isEqualTo(401);
        assertThat(visitor.jsonPath().getString("error.code")).isEqualTo("UNAUTHENTICATED");
        assertThat(nonLeader.statusCode()).isEqualTo(403);
        assertThat(nonLeader.jsonPath().getString("error.code")).isEqualTo("GROUP_ACCESS_DENIED");
        assertThat(ended.statusCode()).isEqualTo(409);
        assertThat(ended.jsonPath().getString("error.code")).isEqualTo("GROUP_ENDED");
    }

    private Group saveGroup(String name) {
        return groups.save(Group.createStudy(name, "공지 인수 테스트 모임", null, null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.MONDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)),
                TestSupportConfig.FIXED_NOW.minusDays(3)));
    }

    private Member saveMember(String nickname, String githubId) {
        return members.save(Member.create(nickname, 20, githubId, Course.BACKEND));
    }

    private void saveLeader(Group group, Member leader) {
        groupMembers.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW.minusDays(3)));
    }

    private void saveMemberOf(Group group, Member member) {
        groupMembers.save(GroupMember.createMember(group, member, TestSupportConfig.FIXED_NOW.minusDays(2)));
    }

    private io.restassured.specification.RequestSpecification authenticated(Member member) {
        return RestAssured.given().cookie(cookies.accessTokenName(), tokens.issue(member.getId()).value());
    }

    private io.restassured.specification.RequestSpecification mutation(Member member, String csrf) {
        return authenticated(member).cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf);
    }

    private String csrfToken() {
        return RestAssured.get("/groups").cookie("XSRF-TOKEN");
    }
}
