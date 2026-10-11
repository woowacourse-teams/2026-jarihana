package com.project.jarihana.group.calendar;

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
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.nullValue;

class GroupEventControllerTest extends IntegrationTestSupport {

    @Autowired GroupJpaRepository groups;
    @Autowired GroupMemberJpaRepository memberships;
    @Autowired MemberRepository members;
    @Autowired AccessTokenProvider tokens;
    @Autowired AuthCookieProperties cookies;
    @Autowired GroupRecurringSeriesRepository series;
    @Autowired GroupRecurringPeriodRepository periods;
    @Autowired GroupLocationHistoryRepository locations;

    @DisplayName("그룹원은 정기 일정 당시의 장소를 조회하고 비가입자는 상세를 볼 수 없다.")
    @Test
    void memberSeesHistoricalScheduleLocation() {
        // Given
        Member member = members.save(Member.create("가온", 8, "calendar-location-member", Course.BACKEND));
        Group group = groups.save(Group.createStudy("장소 이력 모임", "함께해요", null, null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.THURSDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)),
                TestSupportConfig.FIXED_NOW));
        memberships.save(GroupMember.createMember(group, member, TestSupportConfig.FIXED_NOW));
        GroupRecurringSeries savedSeries = series.save(GroupRecurringSeries.create(group,
                LocalDate.of(2026, 8, 19), null, TestSupportConfig.FIXED_NOW));
        periods.save(GroupRecurringPeriod.create(savedSeries, Set.of(DayOfWeek.THURSDAY),
                LocalTime.of(19, 0), LocalTime.of(21, 0), LocalDate.of(2026, 8, 19),
                null, TestSupportConfig.FIXED_NOW));
        locations.save(GroupLocationHistory.create(group, "예전 장소",
                TestSupportConfig.FIXED_NOW));

        // When / Then
        given().queryParam("kind", "RECURRING").queryParam("date", "2026-08-20")
                .get("/groups/{groupId}/calendar/schedule-details", group.getId())
                .then().statusCode(401);
        given().cookie(cookies.accessTokenName(), tokens.issue(member.getId()).value())
                .queryParam("kind", "RECURRING").queryParam("date", "2026-08-20")
                .get("/groups/{groupId}/calendar/schedule-details", group.getId())
                .then().statusCode(200)
                .body("data.title", equalTo("정기 모임"))
                .body("data.location", equalTo("예전 장소"));
    }

    @DisplayName("장소 이력이 없는 과거 일정에는 현재 장소를 소급해 표시하지 않는다.")
    @Test
    void doesNotApplyCurrentLocationToDatesWithoutHistory() {
        // Given
        Member member = members.save(Member.create("가온", 8, "calendar-untracked-location-member", Course.BACKEND));
        Group group = groups.save(Group.createStudy("장소 이력 없는 모임", "함께해요", null, null,
                com.project.jarihana.group.domain.MeetingType.OFFLINE, "현재 장소",
                RecurringGroupSchedule.of(Set.of(DayOfWeek.THURSDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)),
                TestSupportConfig.FIXED_NOW));
        memberships.save(GroupMember.createMember(group, member, TestSupportConfig.FIXED_NOW));
        GroupRecurringSeries savedSeries = series.save(GroupRecurringSeries.create(group,
                LocalDate.of(2026, 8, 19), null, TestSupportConfig.FIXED_NOW));
        periods.save(GroupRecurringPeriod.create(savedSeries, Set.of(DayOfWeek.THURSDAY),
                LocalTime.of(19, 0), LocalTime.of(21, 0), LocalDate.of(2026, 8, 19),
                null, TestSupportConfig.FIXED_NOW));

        // When / Then
        given().cookie(cookies.accessTokenName(), tokens.issue(member.getId()).value())
                .queryParam("kind", "RECURRING").queryParam("date", "2026-08-20")
                .get("/groups/{groupId}/calendar/schedule-details", group.getId())
                .then().statusCode(200)
                .body("data.location", nullValue());
    }

    @DisplayName("정기 일정은 이력 구간에 해당하는 날짜와 그때의 시각으로 공개한다.")
    @Test
    void calendarUsesRecurringPeriodHistory() {
        // Given
        Group group = groups.save(Group.createStudy("이력 모임", "함께해요", null, null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.WEDNESDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)),
                TestSupportConfig.FIXED_NOW));
        GroupRecurringSeries savedSeries = series.save(GroupRecurringSeries.create(group,
                LocalDate.of(2026, 8, 19), null, TestSupportConfig.FIXED_NOW));
        periods.save(GroupRecurringPeriod.create(savedSeries, Set.of(DayOfWeek.WEDNESDAY),
                LocalTime.of(18, 0), LocalTime.of(20, 0), LocalDate.of(2026, 8, 19),
                LocalDate.of(2026, 8, 25), TestSupportConfig.FIXED_NOW));
        periods.save(GroupRecurringPeriod.create(savedSeries, Set.of(DayOfWeek.THURSDAY),
                LocalTime.of(19, 0), LocalTime.of(21, 0), LocalDate.of(2026, 8, 26),
                null, TestSupportConfig.FIXED_NOW));

        // When / Then
        given().queryParam("from", "2026-08-19").queryParam("to", "2026-08-30")
                .get("/groups/{groupId}/calendar", group.getId())
                .then().statusCode(200)
                .body("data.events.size()", equalTo(2))
                .body("data.events[0].startDate", equalTo("2026-08-19"))
                .body("data.events[0].startTime", equalTo("18:00:00"))
                .body("data.events[1].startDate", equalTo("2026-08-27"))
                .body("data.events[1].startTime", equalTo("19:00:00"));
    }

    @DisplayName("모임장이 기본 일정의 달력 표시를 끄면 정기 일정만 숨겨진다.")
    @Test
    void leaderCanHideBaseScheduleOnlyInCalendar() {
        // Given
        Member leader = members.save(Member.create("가온", 8, "calendar-setting-leader", Course.BACKEND));
        Group group = groups.save(Group.createStudy("표시 설정 모임", "함께해요", null, null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.WEDNESDAY), null, null),
                TestSupportConfig.FIXED_NOW));
        memberships.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW));
        GroupRecurringSeries savedSeries = series.save(GroupRecurringSeries.create(group,
                LocalDate.of(2026, 8, 19), null, TestSupportConfig.FIXED_NOW));
        periods.save(GroupRecurringPeriod.create(savedSeries, Set.of(DayOfWeek.WEDNESDAY),
                null, null, LocalDate.of(2026, 8, 19), null, TestSupportConfig.FIXED_NOW));
        String csrf = given().get("/groups/{groupId}", group.getId()).getCookie("XSRF-TOKEN");

        // When
        given().cookie(cookies.accessTokenName(), tokens.issue(leader.getId()).value())
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json").body("{\"showBaseSchedule\":false}")
                .put("/groups/{groupId}/calendar/settings", group.getId())
                .then().statusCode(200).body("data.showBaseSchedule", equalTo(false));

        // Then
        given().queryParam("from", "2026-08-19").queryParam("to", "2026-08-25")
                .get("/groups/{groupId}/calendar", group.getId())
                .then().statusCode(200)
                .body("data.showBaseSchedule", equalTo(false))
                .body("data.events.size()", equalTo(0));
        given().get("/groups/{groupId}", group.getId())
                .then().statusCode(200)
                .body("data.recurringSchedule.daysOfWeek[0]", equalTo("WEDNESDAY"));
    }

    @DisplayName("모임장이 개별 일정을 저장하고 공개 달력에는 제목과 시각만 제공한다.")
    @Test
    void leaderCreatesEventAndCalendarKeepsDetailsPrivate() {
        // Given
        Member leader = members.save(Member.create("가온", 8, "calendar-leader", Course.BACKEND));
        Group group = groups.save(Group.createStudy("달력 모임", "함께해요", null, null, null,
                TestSupportConfig.FIXED_NOW));
        memberships.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW));
        String token = tokens.issue(leader.getId()).value();
        String csrf = given().get("/groups/{groupId}", group.getId()).getCookie("XSRF-TOKEN");

        // When
        long eventId = given()
                .cookie(cookies.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf)
                .header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("""
                        {"title":"가을 모임","startDate":"2026-08-20","endDate":"2026-08-20",
                         "allDay":false,"startTime":"19:00:00","endTime":"21:00:00",
                         "description":"회원만 보는 내용","location":"비공개 장소"}
                        """)
                .post("/groups/{groupId}/events", group.getId())
                .then().statusCode(201)
                .body("data.eventType", equalTo("INDIVIDUAL"))
                .body("data.status", equalTo("AUTO"))
                .body("data.effectiveStatus", equalTo("UPCOMING"))
                .body("data.title", equalTo("가을 모임"))
                .extract().jsonPath().getLong("data.id");

        // Then
        given().queryParam("from", "2026-08-17").queryParam("to", "2026-08-23")
                .get("/groups/{groupId}/calendar", group.getId())
                .then().statusCode(200)
                .body("data.events[0].id", equalTo((int) eventId))
                .body("data.events[0].title", equalTo("가을 모임"))
                .body("data.events[0].kind", equalTo("GROUP_EVENT"))
                .body("data.events[0].location", nullValue())
                .body("data.events[0].description", nullValue());

        given().get("/groups/{groupId}/events/{eventId}", group.getId(), eventId)
                .then().statusCode(401);
        given().cookie(cookies.accessTokenName(), token)
                .get("/groups/{groupId}/events/{eventId}", group.getId(), eventId)
                .then().statusCode(200)
                .header("Cache-Control", containsString("no-store"))
                .body("data.status", equalTo("AUTO"))
                .body("data.effectiveStatus", equalTo("UPCOMING"))
                .body("data.description", equalTo("회원만 보는 내용"))
                .body("data.location", equalTo("비공개 장소"));

        Group another = groups.save(Group.createStudy("다른 달력 모임", "함께해요", null, null, null,
                TestSupportConfig.FIXED_NOW));
        memberships.save(GroupMember.createLeader(another, leader, TestSupportConfig.FIXED_NOW));
        given().cookie(cookies.accessTokenName(), token)
                .get("/groups/{groupId}/events/{eventId}", another.getId(), eventId)
                .then().statusCode(404);
    }

    @DisplayName("모임장은 하루짜리 정기 모임을 등록하고 공개 달력에 고정 제목을 표시한다.")
    @Test
    void leaderCreatesOneOffRegularMeeting() {
        // Given
        Member leader = members.save(Member.create("가온", 8, "calendar-regular-meeting-leader", Course.BACKEND));
        Group group = groups.save(Group.createStudy("유동적 모임", "함께해요", null, null, null,
                TestSupportConfig.FIXED_NOW));
        memberships.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW));
        String token = tokens.issue(leader.getId()).value();
        String csrf = given().get("/groups/{groupId}", group.getId()).getCookie("XSRF-TOKEN");

        // When
        long eventId = given().cookie(cookies.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("""
                        {"eventType":"REGULAR_MEETING","title":"입력한 제목",
                         "startDate":"2026-08-20","endDate":"2026-08-20","allDay":true,
                         "description":"이번 주 모임을 진행해요"}
                        """)
                .post("/groups/{groupId}/events", group.getId())
                .then().statusCode(201)
                .body("data.eventType", equalTo("REGULAR_MEETING"))
                .body("data.status", equalTo("AUTO"))
                .body("data.effectiveStatus", equalTo("UPCOMING"))
                .body("data.title", equalTo("정기 모임"))
                .extract().jsonPath().getLong("data.id");

        given().cookie(cookies.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("""
                        {"eventType":"REGULAR_MEETING","status":"COMPLETED","title":"정기 모임",
                         "startDate":"2026-08-20","endDate":"2026-08-20","allDay":true,
                         "description":"이번 주 모임을 진행해요","version":0}
                        """)
                .put("/groups/{groupId}/events/{eventId}", group.getId(), eventId)
                .then().statusCode(200)
                .body("data.status", equalTo("COMPLETED"))
                .body("data.effectiveStatus", equalTo("COMPLETED"));

        // Then
        given().queryParam("from", "2026-08-20").queryParam("to", "2026-08-20")
                .get("/groups/{groupId}/calendar", group.getId())
                .then().statusCode(200)
                .body("data.events.size()", equalTo(1))
                .body("data.events[0].id", equalTo((int) eventId))
                .body("data.events[0].kind", equalTo("REGULAR_MEETING"))
                .body("data.events[0].title", equalTo("정기 모임"));
    }

    @DisplayName("반복 규칙이 이미 회차를 만드는 날짜에는 별도 정기 모임을 등록할 수 없다.")
    @Test
    void rejectsOneOffRegularMeetingOnRecurringDate() {
        // Given
        Member leader = members.save(Member.create("가온", 8, "calendar-regular-overlap-leader", Course.BACKEND));
        Group group = groups.save(Group.createStudy("수요일 모임", "함께해요", null, null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.THURSDAY), null, null), TestSupportConfig.FIXED_NOW));
        memberships.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW));
        GroupRecurringSeries savedSeries = series.save(GroupRecurringSeries.create(group,
                LocalDate.of(2026, 8, 19), null, TestSupportConfig.FIXED_NOW));
        periods.save(GroupRecurringPeriod.create(savedSeries, Set.of(DayOfWeek.THURSDAY), null, null,
                LocalDate.of(2026, 8, 19), null, TestSupportConfig.FIXED_NOW));
        String token = tokens.issue(leader.getId()).value();
        String csrf = given().get("/groups/{groupId}", group.getId()).getCookie("XSRF-TOKEN");

        // When / Then
        given().cookie(cookies.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("""
                        {"eventType":"REGULAR_MEETING","title":"정기 모임",
                         "startDate":"2026-08-20","endDate":"2026-08-20","allDay":true,
                         "description":"중복은 막아야 해요"}
                        """)
                .post("/groups/{groupId}/events", group.getId())
                .then().statusCode(409).body("error.code", equalTo("GROUP_EVENT_CONFLICT"));
    }

    @DisplayName("모임장이 아닌 회원은 개별 일정을 만들 수 없다.")
    @Test
    void nonLeaderCannotCreateEvent() {
        // Given
        Member outsider = members.save(Member.create("나래", 8, "calendar-outsider", Course.FRONTEND));
        Group group = groups.save(Group.createStudy("권한 검사 모임", "함께해요", null, null, null,
                TestSupportConfig.FIXED_NOW));
        String csrf = given().get("/groups/{groupId}", group.getId()).getCookie("XSRF-TOKEN");

        // When / Then
        given().cookie(cookies.accessTokenName(), tokens.issue(outsider.getId()).value())
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("""
                        {"title":"시도","startDate":"2026-08-20","endDate":"2026-08-20",
                         "allDay":true,"description":"권한 검사"}
                        """)
                .post("/groups/{groupId}/events", group.getId())
                .then().statusCode(403);
    }

    @DisplayName("개별 일정 수정과 삭제는 버전을 검사하고 삭제 뒤 공개 달력에서 제외한다.")
    @Test
    void updatesAndSoftDeletesEventWithVersionCheck() {
        // Given
        Member leader = members.save(Member.create("가온", 8, "calendar-edit-leader", Course.BACKEND));
        Group group = groups.save(Group.createStudy("수정 모임", "함께해요", null, null, null,
                TestSupportConfig.FIXED_NOW));
        memberships.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW));
        String token = tokens.issue(leader.getId()).value();
        String csrf = given().get("/groups/{groupId}", group.getId()).getCookie("XSRF-TOKEN");
        long id = given().cookie(cookies.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("""
                        {"title":"처음","startDate":"2026-08-20","endDate":"2026-08-20",
                         "allDay":true,"description":"첫 설명"}
                        """)
                .post("/groups/{groupId}/events", group.getId())
                .then().statusCode(201).extract().jsonPath().getLong("data.id");

        // When / Then
        given().cookie(cookies.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("""
                        {"title":"변경","startDate":"2026-08-21","endDate":"2026-08-21",
                         "allDay":true,"description":"새 설명","version":0}
                        """)
                .put("/groups/{groupId}/events/{eventId}", group.getId(), id)
                .then().statusCode(200)
                .body("data.title", equalTo("변경"))
                .body("data.version", equalTo(1));

        given().cookie(cookies.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("""
                        {"title":"오래된 화면","startDate":"2026-08-21","endDate":"2026-08-21",
                         "allDay":true,"description":"덮어쓰기 금지","version":0}
                        """)
                .put("/groups/{groupId}/events/{eventId}", group.getId(), id)
                .then().statusCode(409).body("error.code", equalTo("GROUP_EVENT_CONFLICT"));

        given().cookie(cookies.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .queryParam("version", 1)
                .delete("/groups/{groupId}/events/{eventId}", group.getId(), id)
                .then().statusCode(204);

        given().queryParam("from", "2026-08-17").queryParam("to", "2026-08-23")
                .get("/groups/{groupId}/calendar", group.getId())
                .then().statusCode(200).body("data.events.size()", equalTo(0));
    }
}
