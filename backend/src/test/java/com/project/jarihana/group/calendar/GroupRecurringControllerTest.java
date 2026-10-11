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
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

class GroupRecurringControllerTest extends IntegrationTestSupport {

    @Autowired GroupJpaRepository groups;
    @Autowired GroupMemberJpaRepository memberships;
    @Autowired MemberRepository members;
    @Autowired GroupRecurringSeriesRepository series;
    @Autowired GroupRecurringPeriodRepository periods;
    @Autowired AccessTokenProvider tokens;
    @Autowired AuthCookieProperties cookies;
    @Autowired JdbcTemplate jdbc;

    @DisplayName("달력 공개 설정에서는 범위 없는 구형 정기 일정 요청을 새로고침 안내와 함께 거절한다.")
    @Test
    void rejectsLegacyRuleMutation() {
        Member leader = members.save(Member.create("가온", 8, "legacy-block-leader", Course.BACKEND));
        Group group = groups.save(Group.createStudy("기존 화면 모임", "함께해요", null, null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.MONDAY), null, null), TestSupportConfig.FIXED_NOW));
        memberships.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW));
        String token = tokens.issue(leader.getId()).value();
        String csrf = given().get("/groups/{groupId}", group.getId()).getCookie("XSRF-TOKEN");

        given().cookie(cookies.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("{\"daysOfWeek\":[\"WEDNESDAY\"],\"startTime\":null,\"endTime\":null}")
                .put("/groups/{groupId}/recurring-schedule", group.getId())
                .then().statusCode(409).body("error.code", equalTo("CALENDAR_CLIENT_OUTDATED"));
        assertThat(groups.findById(group.getId()).orElseThrow().getRecurringSchedule()
                .getActivityDays().contains(DayOfWeek.MONDAY)).isTrue();
    }

    @DisplayName("유동적 모임에 정기 규칙을 등록하면 등록일부터 첫 묶음과 이력을 함께 만든다.")
    @Test
    void registeringRuleStartsOnRegistrationDate() {
        Member leader = members.save(Member.create("가온", 8, "first-rule-leader", Course.BACKEND));
        Group group = groups.save(Group.createStudy("유동적 모임", "함께해요", null, null,
                null, TestSupportConfig.FIXED_NOW.minusDays(30)));
        jdbc.update("UPDATE groups SET created_at = ? WHERE id = ?",
                java.sql.Timestamp.valueOf(TestSupportConfig.FIXED_NOW.minusDays(30)), group.getId());
        memberships.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW));
        String token = tokens.issue(leader.getId()).value();
        String csrf = given().get("/groups/{groupId}", group.getId()).getCookie("XSRF-TOKEN");

        given().cookie(cookies.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("{\"daysOfWeek\":[\"WEDNESDAY\"],\"startTime\":null,\"endTime\":null}")
                .post("/groups/{groupId}/recurring-schedule/series", group.getId())
                .then().statusCode(201)
                .body("data.startDate", equalTo("2026-08-19"));

        GroupRecurringSeries saved = series.findFirstByGroupIdAndCurrentTrue(group.getId()).orElseThrow();
        assertThat(saved.getCalendarStartDate()).isEqualTo(LocalDate.of(2026, 8, 19));
        assertThat(periods.findAllBySeriesIdOrderByEffectiveFromAsc(saved.getId()).getFirst().getEffectiveFrom())
                .isEqualTo(LocalDate.of(2026, 8, 19));
        assertThat(groups.findById(group.getId()).orElseThrow().getRecurringSchedule()).isNotNull();
        given().queryParam("from", "2026-08-01").queryParam("to", "2026-08-31")
                .get("/groups/{groupId}/calendar", group.getId())
                .then().statusCode(200)
                .body("data.flexibleBeforeFirstRecurring.untilDate", equalTo("2026-08-18"));

        given().cookie(cookies.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("{\"daysOfWeek\":[\"THURSDAY\"],\"startTime\":null,\"endTime\":null}")
                .post("/groups/{groupId}/recurring-schedule/series", group.getId())
                .then().statusCode(409);
        assertThat(series.findAllByGroupIdOrderByCalendarStartDateAsc(group.getId())).hasSize(1);
    }

    @DisplayName("앞으로의 일정 수정은 오늘부터 새 규칙 구간을 만들고 이전 구간을 보존한다.")
    @Test
    void fromTodaySplitsCurrentRule() {
        // Given
        Member leader = members.save(Member.create("가온", 8, "recurring-leader", Course.BACKEND));
        Group group = groups.save(Group.createStudy("정기 모임", "함께해요", null, null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.WEDNESDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)),
                TestSupportConfig.FIXED_NOW.minusDays(30)));
        memberships.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW));
        GroupRecurringSeries savedSeries = series.save(GroupRecurringSeries.create(group,
                LocalDate.of(2026, 8, 1), null, TestSupportConfig.FIXED_NOW));
        periods.save(GroupRecurringPeriod.create(savedSeries, Set.of(DayOfWeek.WEDNESDAY),
                LocalTime.of(19, 0), LocalTime.of(21, 0), LocalDate.of(2026, 8, 1),
                null, TestSupportConfig.FIXED_NOW));
        String token = tokens.issue(leader.getId()).value();
        String csrf = given().get("/groups/{groupId}", group.getId()).getCookie("XSRF-TOKEN");

        // When
        var response = given().cookie(cookies.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("""
                        {"daysOfWeek":["THURSDAY"],"startTime":"18:00:00","endTime":"20:00:00",
                         "applyScope":"FROM_TODAY","version":0}
                        """)
                .put("/groups/{groupId}/recurring-schedule/scoped", group.getId())
                .then().extract();
        assertThat(response.statusCode()).as(response.asString()).isEqualTo(200);
        assertThat(response.jsonPath().getInt("data.version")).isEqualTo(1);

        // Then
        var history = periods.findAllBySeriesIdOrderByEffectiveFromAsc(savedSeries.getId());
        assertThat(history).hasSize(2);
        assertThat(history.get(0).getEffectiveUntil()).isEqualTo(LocalDate.of(2026, 8, 18));
        assertThat(history.get(1).getEffectiveFrom()).isEqualTo(LocalDate.of(2026, 8, 19));
        assertThat(history.get(1).getDaysOfWeek().contains(DayOfWeek.THURSDAY)).isTrue();
        assertThat(groups.findById(group.getId()).orElseThrow().getRecurringSchedule()
                .getActivityDays().contains(DayOfWeek.THURSDAY)).isTrue();
    }

    @DisplayName("과거 규칙 구간은 날짜 경계를 유지한 채 요일과 시각만 수정한다.")
    @Test
    void editsPastPeriodWithoutChangingCurrentRule() {
        // Given
        Member leader = members.save(Member.create("가온", 8, "past-period-leader", Course.BACKEND));
        Group group = groups.save(Group.createStudy("과거 이력 모임", "함께해요", null, null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.WEDNESDAY), null, null),
                TestSupportConfig.FIXED_NOW));
        memberships.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW));
        GroupRecurringSeries savedSeries = series.save(GroupRecurringSeries.create(group,
                LocalDate.of(2026, 8, 1), null, TestSupportConfig.FIXED_NOW));
        GroupRecurringPeriod past = periods.save(GroupRecurringPeriod.create(savedSeries, Set.of(DayOfWeek.MONDAY),
                null, null, LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 15), TestSupportConfig.FIXED_NOW));
        periods.save(GroupRecurringPeriod.create(savedSeries, Set.of(DayOfWeek.WEDNESDAY),
                null, null, LocalDate.of(2026, 8, 16), null, TestSupportConfig.FIXED_NOW));
        String token = tokens.issue(leader.getId()).value();
        String csrf = given().get("/groups/{groupId}", group.getId()).getCookie("XSRF-TOKEN");

        // When
        given().cookie(cookies.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("""
                        {"daysOfWeek":["THURSDAY"],"startTime":"18:00:00",
                         "endTime":"20:00:00","version":0}
                        """)
                .put("/groups/{groupId}/recurring-schedule/periods/{periodId}", group.getId(), past.getId())
                .then().statusCode(200).body("data.version", equalTo(1));

        // Then
        var history = periods.findAllBySeriesIdOrderByEffectiveFromAsc(savedSeries.getId());
        assertThat(history.get(0).getEffectiveFrom()).isEqualTo(LocalDate.of(2026, 8, 1));
        assertThat(history.get(0).getEffectiveUntil()).isEqualTo(LocalDate.of(2026, 8, 15));
        assertThat(history.get(0).getDaysOfWeek().contains(DayOfWeek.THURSDAY)).isTrue();
        assertThat(history.get(1).getDaysOfWeek().contains(DayOfWeek.WEDNESDAY)).isTrue();
        assertThat(groups.findById(group.getId()).orElseThrow().getRecurringSchedule()
                .getActivityDays().contains(DayOfWeek.WEDNESDAY)).isTrue();
    }

    @DisplayName("정기 일정 전체 표시 기간은 이력 구간 경계를 바꾸지 않고 제한한다.")
    @Test
    void changesCalendarRangeWithoutMovingRuleBoundaries() {
        // Given
        Member leader = members.save(Member.create("가온", 8, "range-leader", Course.BACKEND));
        Group group = groups.save(Group.createStudy("기간 수정 모임", "함께해요", null, null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.WEDNESDAY), null, null),
                TestSupportConfig.FIXED_NOW));
        memberships.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW));
        GroupRecurringSeries savedSeries = series.save(GroupRecurringSeries.create(group,
                LocalDate.of(2026, 8, 19), null, TestSupportConfig.FIXED_NOW));
        periods.save(GroupRecurringPeriod.create(savedSeries, Set.of(DayOfWeek.WEDNESDAY),
                null, null, LocalDate.of(2026, 8, 19), null, TestSupportConfig.FIXED_NOW));
        String token = tokens.issue(leader.getId()).value();
        String csrf = given().get("/groups/{groupId}", group.getId()).getCookie("XSRF-TOKEN");

        // When / Then
        given().cookie(cookies.accessTokenName(), token)
                .get("/groups/{groupId}/recurring-schedule/manage", group.getId())
                .then().statusCode(200)
                .body("data.startDate", equalTo("2026-08-19"))
                .body("data.version", equalTo(0));

        given().cookie(cookies.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("{\"startDate\":\"2026-08-20\",\"endDate\":\"2026-08-31\",\"version\":0}")
                .put("/groups/{groupId}/recurring-schedule/calendar-range", group.getId())
                .then().statusCode(200).body("data.version", equalTo(1));

        given().queryParam("from", "2026-08-19").queryParam("to", "2026-08-31")
                .get("/groups/{groupId}/calendar", group.getId())
                .then().statusCode(200)
                .body("data.events.size()", equalTo(1))
                .body("data.events[0].startDate", equalTo("2026-08-26"));
        assertThat(periods.findAllBySeriesIdOrderByEffectiveFromAsc(savedSeries.getId()).getFirst()
                .getEffectiveFrom()).isEqualTo(LocalDate.of(2026, 8, 19));
    }

    @DisplayName("직전 규칙 삭제는 그 구간 시작 전의 정기 발생 기록만 남긴다.")
    @Test
    void deletingPreviousRulePreservesOlderOccurrences() {
        // Given
        Member leader = members.save(Member.create("가온", 8, "delete-rule-leader", Course.BACKEND));
        Group group = groups.save(Group.createStudy("삭제 모임", "함께해요", null, null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.WEDNESDAY), null, null),
                TestSupportConfig.FIXED_NOW));
        memberships.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW));
        GroupRecurringSeries savedSeries = series.save(GroupRecurringSeries.create(group,
                LocalDate.of(2026, 8, 1), null, TestSupportConfig.FIXED_NOW));
        periods.save(GroupRecurringPeriod.create(savedSeries, Set.of(DayOfWeek.MONDAY),
                null, null, LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 15), TestSupportConfig.FIXED_NOW));
        periods.save(GroupRecurringPeriod.create(savedSeries, Set.of(DayOfWeek.WEDNESDAY),
                null, null, LocalDate.of(2026, 8, 16), null, TestSupportConfig.FIXED_NOW));
        String token = tokens.issue(leader.getId()).value();
        String csrf = given().get("/groups/{groupId}", group.getId()).getCookie("XSRF-TOKEN");

        // When
        given().cookie(cookies.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("{\"applyScope\":\"PREVIOUS_RULE\",\"version\":0}")
                .delete("/groups/{groupId}/recurring-schedule/scoped", group.getId())
                .then().statusCode(204);

        // Then
        assertThat(groups.findById(group.getId()).orElseThrow().getRecurringSchedule()).isNull();
        assertThat(series.findById(savedSeries.getId()).orElseThrow().getCalendarEndDate())
                .isEqualTo(LocalDate.of(2026, 8, 15));
        given().queryParam("from", "2026-08-01").queryParam("to", "2026-08-31")
                .get("/groups/{groupId}/calendar", group.getId())
                .then().statusCode(200)
                .body("data.events.size()", equalTo(2))
                .body("data.events[0].startDate", equalTo("2026-08-03"))
                .body("data.events[1].startDate", equalTo("2026-08-10"))
                .body("data.flexibleAfterRecurring[0].fromDate", equalTo("2026-08-16"));
    }

    @DisplayName("직전 일정은 현재 구간만, 모든 일정은 이력 구간 전부의 규칙만 바꾼다.")
    @Test
    void previousAndAllScopesPreserveDateBoundaries() {
        // Given
        Member leader = members.save(Member.create("가온", 8, "scope-leader", Course.BACKEND));
        Group group = groups.save(Group.createStudy("범위 선택 모임", "함께해요", null, null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.WEDNESDAY), null, null),
                TestSupportConfig.FIXED_NOW));
        memberships.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW));
        GroupRecurringSeries savedSeries = series.save(GroupRecurringSeries.create(group,
                LocalDate.of(2026, 8, 1), null, TestSupportConfig.FIXED_NOW));
        periods.save(GroupRecurringPeriod.create(savedSeries, Set.of(DayOfWeek.MONDAY),
                null, null, LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 15), TestSupportConfig.FIXED_NOW));
        periods.save(GroupRecurringPeriod.create(savedSeries, Set.of(DayOfWeek.WEDNESDAY),
                null, null, LocalDate.of(2026, 8, 16), null, TestSupportConfig.FIXED_NOW));
        String token = tokens.issue(leader.getId()).value();
        String csrf = given().get("/groups/{groupId}", group.getId()).getCookie("XSRF-TOKEN");

        // When
        given().cookie(cookies.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("""
                        {"daysOfWeek":["THURSDAY"],"startTime":null,"endTime":null,
                         "applyScope":"PREVIOUS_RULE","version":0}
                        """)
                .put("/groups/{groupId}/recurring-schedule/scoped", group.getId())
                .then().statusCode(200);
        var afterPrevious = periods.findAllBySeriesIdOrderByEffectiveFromAsc(savedSeries.getId());
        assertThat(afterPrevious.get(0).getDaysOfWeek().contains(DayOfWeek.MONDAY)).isTrue();
        assertThat(afterPrevious.get(1).getDaysOfWeek().contains(DayOfWeek.THURSDAY)).isTrue();

        // Then
        given().cookie(cookies.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("""
                        {"daysOfWeek":["FRIDAY"],"startTime":null,"endTime":null,
                         "applyScope":"ALL","version":1}
                        """)
                .put("/groups/{groupId}/recurring-schedule/scoped", group.getId())
                .then().statusCode(200);
        var afterAll = periods.findAllBySeriesIdOrderByEffectiveFromAsc(savedSeries.getId());
        assertThat(afterAll).allSatisfy(period -> assertThat(period.getDaysOfWeek().contains(DayOfWeek.FRIDAY)).isTrue());
        assertThat(afterAll.get(0).getEffectiveUntil()).isEqualTo(LocalDate.of(2026, 8, 15));
        assertThat(afterAll.get(1).getEffectiveFrom()).isEqualTo(LocalDate.of(2026, 8, 16));
    }
}
