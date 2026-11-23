package com.project.jarihana.group.command.controller;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.calendar.GroupRecurringSeriesRepository;
import com.project.jarihana.group.calendar.GroupRecurringPeriodRepository;
import com.project.jarihana.group.calendar.GroupLocationHistoryRepository;
import com.project.jarihana.group.calendar.GroupLocationHistory;
import com.project.jarihana.group.domain.MeetingType;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.domain.SessionGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.image.command.repository.ImageUploadCommandRepository;
import com.project.jarihana.image.domain.ImageUpload;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.recruitment.query.repository.GroupRecruitmentJpaRepository;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.assertj.core.api.Assertions.assertThat;

@TestPropertySource(properties = "jarihana.group-calendar.legacy-recurring-write-enabled=true")
class GroupCommandControllerTest extends IntegrationTestSupport {

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private GroupRecurringSeriesRepository recurringSeriesRepository;

    @Autowired
    private GroupRecurringPeriodRepository recurringPeriodRepository;

    @Autowired
    private GroupLocationHistoryRepository locationHistoryRepository;

    @Autowired
    private GroupMemberJpaRepository groupMemberRepository;

    @Autowired
    private GroupRecruitmentJpaRepository recruitmentRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private ImageUploadCommandRepository imageUploadCommandRepository;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @Autowired
    private JdbcTemplate jdbc;

    @DisplayName("전환기 구형 요청도 기존 규칙을 초기 이력으로 남기고 오늘부터 새 규칙을 적용한다.")
    @Test
    void legacyRuleWriteRecordsHistoryBeforeBackfill() {
        Member leader = memberRepository.save(Member.create("가온", 8, "legacy-history-leader", Course.BACKEND));
        Group group = createGroup(leader, "전환기 이력 모임");
        jdbc.update("UPDATE groups SET created_at = ? WHERE id = ?",
                java.sql.Timestamp.valueOf(TestSupportConfig.FIXED_NOW.minusDays(30)), group.getId());
        String accessToken = accessTokenProvider.issue(leader.getId()).value();
        String csrfToken = csrfToken(group.getId());

        given().cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken).header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("{\"daysOfWeek\":[\"THURSDAY\"],\"startTime\":null,\"endTime\":null}")
                .put("/groups/{groupId}/recurring-schedule", group.getId())
                .then().statusCode(200);

        var history = recurringSeriesRepository.findAllByGroupIdOrderByCalendarStartDateAsc(group.getId());
        assertThat(history).hasSize(1);
        var rules = recurringPeriodRepository.findAllBySeriesIdOrderByEffectiveFromAsc(history.getFirst().getId());
        assertThat(rules).hasSize(2);
        assertThat(rules.getFirst().getEffectiveUntil()).isEqualTo(LocalDate.of(2026, 8, 18));
        assertThat(rules.getLast().getEffectiveFrom()).isEqualTo(LocalDate.of(2026, 8, 19));
    }

    @DisplayName("회원이 그룹을 개설하면 모임 방식과 장소를 저장한다.")
    @Test
    void createsGroupWithMeetingInformation() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, "github-controller-create", Course.BACKEND));
        imageUploadCommandRepository.save(ImageUpload.create(
                UUID.randomUUID(),
                "group.webp",
                "image/webp",
                1024,
                "groups/tmp/controller.webp",
                TestSupportConfig.FIXED_NOW.plusMinutes(10),
                TestSupportConfig.FIXED_NOW
        ));
        String accessToken = accessTokenProvider.issue(member.getId()).value();
        String csrfToken = csrfToken();

        // When
        ExtractableResponse<Response> response = given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("""
                        {
                          "type": "STUDY",
                          "name": "컨트롤러 생성 그룹",
                          "introduction": "생성 API를 확인합니다.",
                          "description": null,
                          "meetingType": "OFFLINE",
                          "location": "서울 캠퍼스",
                          "representativeImageKey": "groups/tmp/controller.webp",
                          "recurringSchedule": {
                            "daysOfWeek": ["MONDAY"],
                            "startTime": "19:00:00",
                            "endTime": "21:00:00"
                          },
                          "sessionSchedule": null
                        }
                        """)
                .when()
                .post("/groups")
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(201);
        long groupId = ((Number) response.path("data.id")).longValue();
        assertThat(response.header("Location")).isEqualTo("/api/groups/" + groupId);
        Group group = groupRepository.findById(groupId).orElseThrow();
        assertThat(group.getMeetingType()).isEqualTo(MeetingType.OFFLINE);
        assertThat(group.getLocation()).isEqualTo("서울 캠퍼스");
        assertThat(group.getRepresentativeImageKey()).isEqualTo("groups/" + groupId + "/controller.webp");
        var series = recurringSeriesRepository.findAllByGroupIdOrderByCalendarStartDateAsc(groupId);
        assertThat(series).hasSize(1);
        assertThat(series.getFirst().getCalendarStartDate()).isEqualTo(TestSupportConfig.FIXED_NOW.toLocalDate());
        assertThat(recurringPeriodRepository.findAllBySeriesIdOrderByEffectiveFromAsc(series.getFirst().getId()))
                .hasSize(1);
        assertThat(locationHistoryRepository.findAllByGroupIdOrderByEffectiveFromAtAscIdAsc(groupId))
                .singleElement().extracting("location").isEqualTo("서울 캠퍼스");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM group_space WHERE group_id = ?", Long.class, groupId))
                .isZero();
    }

    @DisplayName("선택한 기본 도면과 배치를 모임 생성 즉시 첫 아지트로 조회할 수 있다.")
    @ParameterizedTest
    @CsvSource({"CLUB, lounge, 12", "STUDY, climbing, 11", "CLUB, boardgame, 11", "STUDY, dining, 11",
            "CLUB, band, 11", "STUDY, study, 11", "CLUB, photo, 11"})
    void createsGroupWithSelectedClubhouse(String type, String template, int version) {
        Member member = memberRepository.save(Member.create("가온", 8, "clubhouse-creator", Course.BACKEND));
        String token = accessTokenProvider.issue(member.getId()).value();
        String csrf = csrfToken();
        String roomName = "가".repeat(29);

        int groupId = createGroupWithClubhouse(token, csrf, type, roomName + "🎉 모임", template);

        var preset = given().get("/group-spaces/blueprints/{template}/default", template)
                .then().statusCode(200).body("data.defaultRoom.name", is("주말 아지트")).extract();
        given().cookie(authCookieProperties.accessTokenName(), token)
                .get("/groups/{groupId}/space", groupId)
                .then().statusCode(200)
                .body("data.canEdit", is(true))
                .body("data.revision", is(1))
                .body("data.blueprintRef.templateKey", is(template))
                .body("data.blueprintRef.version", is(version))
                .body("data.room.template", is(template))
                .body("data.room.version", is(version))
                .body("data.room.name", is(roomName))
                .body("data.room.items", equalTo(preset.path("data.defaultRoom.items")))
                .body("data.geometry", equalTo(preset.path("data.geometry")))
                .body("data.defaultRoom", nullValue());
    }

    @DisplayName("기본 도면을 바꾸면 신규 모임에만 적용되고 기존 모임은 생성할 때 저장한 배치를 유지한다.")
    @Test
    void newDefaultDoesNotChangeAnExistingClubhouse() {
        Member member = memberRepository.save(Member.create("가온", 8, "clubhouse-pinned-version", Course.BACKEND));
        String token = accessTokenProvider.issue(member.getId()).value();
        String csrf = csrfToken();
        int existing = createGroupWithClubhouse(token, csrf, "CLUB", "복층 라운지 모임", "lounge");

        jdbc.update("UPDATE space_blueprint_default SET blueprint_version=11 WHERE template_key='lounge'");
        try {
            int created = createGroupWithClubhouse(token, csrf, "CLUB", "단층 라운지 모임", "lounge");

            given().cookie(authCookieProperties.accessTokenName(), token)
                    .get("/groups/{groupId}/space", created)
                    .then().statusCode(200)
                    .body("data.blueprintRef.version", is(11))
                    .body("data.geometry.mezzanine", nullValue())
                    .body("data.room.version", is(11))
                    .body("data.room.items.size()", is(24));
            given().cookie(authCookieProperties.accessTokenName(), token)
                    .get("/groups/{groupId}/space", existing)
                    .then().statusCode(200)
                    .body("data.blueprintRef.version", is(12))
                    .body("data.geometry.stairs.steps", is(26))
                    .body("data.room.version", is(12))
                    .body("data.room.items.size()", is(32));
        } finally {
            jdbc.update("UPDATE space_blueprint_default SET blueprint_version=12 WHERE template_key='lounge'");
        }
    }

    @DisplayName("일부 가구를 신규 배치할 수 없으면 초기 배치의 해당 가구와 위에 놓인 소품을 함께 제외한다.")
    @Test
    void excludesRetiredFurnitureAndItsPropsFromNewClubhouse() {
        Member member = memberRepository.save(Member.create("가온", 8, "clubhouse-retired-furniture", Course.BACKEND));
        String token = accessTokenProvider.issue(member.getId()).value();
        String csrf = csrfToken();
        jdbc.update("UPDATE space_furniture_catalog SET placeable = false WHERE kind = 'coffeeTable'");

        try {
            int groupId = given().cookie(authCookieProperties.accessTokenName(), token)
                    .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                    .contentType("application/json")
                    .body("""
                            {"type":"CLUB","name":"클라이밍 모임","introduction":"아지트 소개","meetingType":"ONLINE",
                             "clubhouseTemplateKey":"climbing"}
                            """)
                    .post("/groups").then().statusCode(201).extract().path("data.id");

            given().cookie(authCookieProperties.accessTokenName(), token)
                    .get("/groups/{groupId}/space", groupId)
                    .then().statusCode(200)
                    .body("data.room.items.kind", hasItem("propBooks"))
                    .body("data.room.items.kind", not(hasItem("coffeeTable")))
                    .body("data.room.items.parentId", not(hasItem("lounge-table")));
        } finally {
            jdbc.update("UPDATE space_furniture_catalog SET placeable = true WHERE kind = 'coffeeTable'");
        }
    }

    @DisplayName("공개되지 않은 아지트와 같이해요의 아지트 선택은 그룹을 생성하지 않는다.")
    @ParameterizedTest
    @CsvSource({"STUDY, unpublished", "SESSION, lounge"})
    void rejectsUnavailableClubhouseTemplate(String type, String template) {
        Member member = memberRepository.save(Member.create("가온", 8, "clubhouse-invalid-creator", Course.BACKEND));
        String token = accessTokenProvider.issue(member.getId()).value();
        String csrf = csrfToken();
        String schedule = type.equals("SESSION")
                ? "\"sessionSchedule\": {\"sessionDate\":\"2026-08-20\",\"startTime\":\"19:00:00\",\"endTime\":\"21:00:00\"},"
                : "";

        given().cookie(authCookieProperties.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("""
                        {"type":"%s","name":"아지트 선택 불가 모임","introduction":"아지트 소개","meetingType":"ONLINE",
                         %s
                         "clubhouseTemplateKey":"%s"}
                        """.formatted(type, schedule, template))
                .post("/groups").then().statusCode(400)
                .body("error.code", is("INVALID_PARAMETER"));

        assertThat(jdbc.queryForObject("SELECT count(*) FROM groups WHERE name = '아지트 선택 불가 모임'", Long.class))
                .isZero();
    }

    @DisplayName("아지트 저장 이후 대표 이미지 검증에 실패하면 그룹과 아지트 모두 롤백한다.")
    @Test
    void rollsBackGroupAndClubhouseForUnknownRepresentativeImageKey() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, "github-controller-image-not-found", Course.BACKEND));
        String accessToken = accessTokenProvider.issue(member.getId()).value();
        String csrfToken = csrfToken();

        // When
        ExtractableResponse<Response> response = given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("""
                        {
                          "type": "STUDY",
                          "name": "이미지 검증 그룹",
                          "introduction": "이미지 검증을 확인합니다.",
                          "description": null,
                          "meetingType": "ONLINE",
                          "location": null,
                          "clubhouseTemplateKey": "lounge",
                          "representativeImageKey": "groups/tmp/not-found.webp",
                          "recurringSchedule": {
                            "daysOfWeek": ["MONDAY"],
                            "startTime": "19:00:00",
                            "endTime": "21:00:00"
                          },
                          "sessionSchedule": null
                        }
                        """)
                .when()
                .post("/groups")
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("IMAGE_NOT_FOUND");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM groups WHERE name = '이미지 검증 그룹'", Long.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM group_space", Long.class)).isZero();
    }

    @DisplayName("모임장은 그룹 기본 정보 전체 교체 결과를 상세 응답으로 받는다.")
    @Test
    void replacesGroupBasicInformation() {
        // Given
        Member leader = memberRepository.save(Member.create("가온", 8, "github-controller-leader", Course.BACKEND));
        Group group = createGroup(leader, "컨트롤러 수정 그룹");
        String accessToken = accessTokenProvider.issue(leader.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("""
                        {
                          "name": "변경된 그룹",
                          "introduction": "변경된 소개",
                          "description": null,
                          "meetingType": "OFFLINE",
                          "location": "서울 캠퍼스",
                          "representativeImageKey": null
                        }
                        """)
                .when()
                .put("/groups/{groupId}", group.getId())
                .then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.id", equalTo(group.getId().intValue()))
                .body("data.name", equalTo("변경된 그룹"))
                .body("data.introduction", equalTo("변경된 소개"))
                .body("data.description", nullValue())
                .body("data.meetingType", equalTo("OFFLINE"))
                .body("data.location", equalTo("서울 캠퍼스"))
                .body("data.representativeImageUrl", equalTo("images/default-group.png"))
                .body("data.recurringSchedule.startTime", equalTo("19:00:00"))
                .body("error", nullValue());

        assertThat(groupRepository.findById(group.getId()).orElseThrow().getRepresentativeImageKey()).isNull();
    }

    @DisplayName("모임 장소를 수정하면 이전 장소와 새 장소의 적용 시각을 함께 저장한다.")
    @Test
    void recordsLocationHistoryWhenGroupLocationChanges() {
        // Given
        Member leader = memberRepository.save(Member.create("가온", 8, "location-history-leader", Course.BACKEND));
        Group group = groupRepository.save(Group.createStudy("장소 변경 모임", "기존 소개", null, null,
                MeetingType.OFFLINE, "기존 장소", null, TestSupportConfig.FIXED_NOW.minusDays(1)));
        groupMemberRepository.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW.minusDays(1)));
        locationHistoryRepository.save(GroupLocationHistory.create(group, "기존 장소",
                TestSupportConfig.FIXED_NOW.minusDays(1)));
        String token = accessTokenProvider.issue(leader.getId()).value();
        String csrf = csrfToken(group.getId());

        // When
        given().cookie(authCookieProperties.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("""
                        {"name":"장소 변경 모임","introduction":"기존 소개","description":null,
                         "meetingType":"OFFLINE","location":"새 장소","representativeImageKey":null}
                        """)
                .put("/groups/{groupId}", group.getId())
                .then().statusCode(200);

        // Then
        var history = locationHistoryRepository.findAllByGroupIdOrderByEffectiveFromAtAscIdAsc(group.getId());
        assertThat(history).hasSize(2);
        assertThat(history.get(0).getLocation()).isEqualTo("기존 장소");
        assertThat(history.get(0).getEffectiveUntilAt()).isEqualTo(TestSupportConfig.FIXED_NOW);
        assertThat(history.get(1).getLocation()).isEqualTo("새 장소");
        assertThat(history.get(1).getEffectiveUntilAt()).isNull();
    }

    @DisplayName("기존 장소 이력이 없으면 수정 전 장소의 과거 시작일을 만들어내지 않는다.")
    @Test
    void doesNotInventStartDateForLegacyLocationWithoutHistory() {
        // Given
        Member leader = memberRepository.save(Member.create("가온", 8, "location-history-legacy-leader", Course.BACKEND));
        Group group = groupRepository.save(Group.createStudy("이력 없는 장소 모임", "소개", null, null,
                MeetingType.OFFLINE, "기존 장소", null, TestSupportConfig.FIXED_NOW.minusDays(1)));
        groupMemberRepository.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW.minusDays(1)));
        String token = accessTokenProvider.issue(leader.getId()).value();
        String csrf = csrfToken(group.getId());

        // When
        given().cookie(authCookieProperties.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("""
                        {"name":"이력 없는 장소 모임","introduction":"소개","description":null,
                         "meetingType":"OFFLINE","location":"새 장소","representativeImageKey":null}
                        """)
                .put("/groups/{groupId}", group.getId())
                .then().statusCode(200);

        // Then
        var history = locationHistoryRepository.findAllByGroupIdOrderByEffectiveFromAtAscIdAsc(group.getId());
        assertThat(history).hasSize(1);
        assertThat(history.getFirst().getLocation()).isEqualTo("새 장소");
        assertThat(history.getFirst().getEffectiveFromAt()).isEqualTo(TestSupportConfig.FIXED_NOW);
    }

    @DisplayName("그룹 기본 정보 전체 교체 요청에서 대표 이미지 키가 누락되면 거부한다.")
    @Test
    void rejectsModifyRequestWhenRepresentativeImageKeyIsOmitted() {
        // Given
        Member leader = memberRepository.save(Member.create("가온", 8, "github-controller-image-required", Course.BACKEND));
        Group group = createGroup(leader, "대표 이미지 필수 그룹");
        String accessToken = accessTokenProvider.issue(leader.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When
        ExtractableResponse<Response> response = given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("""
                        {
                          "name": "변경된 그룹",
                          "introduction": "변경된 소개",
                          "description": null,
                          "meetingType": "OFFLINE",
                          "location": "서울 캠퍼스"
                        }
                        """)
                .when()
                .put("/groups/{groupId}", group.getId())
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("INVALID_PARAMETER");
    }

    private int createGroupWithClubhouse(String token, String csrf, String type, String name, String template) {
        return given().cookie(authCookieProperties.accessTokenName(), token)
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json")
                .body("""
                        {"type":"%s","name":"%s","introduction":"아지트 소개","meetingType":"ONLINE",
                         "clubhouseTemplateKey":"%s"}
                        """.formatted(type, name, template))
                .post("/groups").then().statusCode(201).extract().path("data.id");
    }

    private Group createGroup(Member leader, String name) {
        Group group = groupRepository.save(Group.createStudy(
                name,
                "기존 소개",
                "기존 설명",
                "groups/original.webp",
                RecurringGroupSchedule.of(
                        Set.of(DayOfWeek.MONDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)),
                TestSupportConfig.FIXED_NOW
        ));
        groupMemberRepository.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW));
        return group;
    }

    private String csrfToken(Long groupId) {
        ExtractableResponse<Response> response = given()
                .when()
                .get("/groups/{groupId}", groupId)
                .then()
                .extract();
        return response.cookie("XSRF-TOKEN");
    }

    private String csrfToken() {
        ExtractableResponse<Response> response = given()
                .when()
                .get("/groups")
                .then()
                .extract();
        return response.cookie("XSRF-TOKEN");
    }

    @DisplayName("모임장이 아닌 회원의 그룹 기본 정보 교체 요청은 거부한다.")
    @Test
    void rejectsModifyRequestFromNonLeader() {
        // Given
        Member leader = memberRepository.save(Member.create("가온", 8, "github-controller-owner", Course.BACKEND));
        Member member = memberRepository.save(Member.create("누리", 8, "github-controller-member", Course.BACKEND));
        Group group = createGroup(leader, "컨트롤러 권한 그룹");
        groupMemberRepository.save(GroupMember.createMember(group, member, TestSupportConfig.FIXED_NOW));
        String accessToken = accessTokenProvider.issue(member.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When
        ExtractableResponse<Response> response = given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("""
                        {
                          "name": "변경 시도",
                          "introduction": "소개",
                          "description": null,
                          "meetingType": "FLEXIBLE",
                          "location": null,
                          "representativeImageKey": null
                        }
                        """)
                .when()
                .put("/groups/{groupId}", group.getId())
                .then()
                .extract();

        // Then
        org.assertj.core.api.Assertions.assertThat(response.statusCode()).isEqualTo(403);
        org.assertj.core.api.Assertions.assertThat(response.jsonPath().getString("error.code"))
                .isEqualTo("GROUP_ACCESS_DENIED");
    }

    @DisplayName("생성 후 24시간 이내 모임장의 삭제 요청은 204를 반환하고 그룹을 제거한다.")
    @Test
    void deletesGroupWithinDeleteWindow() {
        // Given
        Member leader = memberRepository.save(Member.create("가온", 8, "github-controller-delete", Course.BACKEND));
        Group group = createGroup(leader, "컨트롤러 삭제 그룹");
        recruitmentRepository.save(GroupRecruitment.create(
                group, JoinMethod.APPROVAL, 3,
                TestSupportConfig.FIXED_NOW.minusHours(1), TestSupportConfig.FIXED_NOW.plusHours(1)));
        String accessToken = accessTokenProvider.issue(leader.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .when()
                .delete("/groups/{groupId}", group.getId())
                .then()
                .statusCode(204)
                .body(equalTo(""));

        given()
                .when()
                .get("/groups/{groupId}", group.getId())
                .then()
                .statusCode(404)
                .body("error.code", equalTo("GROUP_NOT_FOUND"));
    }

    @DisplayName("종료 요청 상태가 ENDED가 아니면 400을 반환한다.")
    @Test
    void rejectsTerminationWithInvalidStatus() {
        Member leader = memberRepository.save(Member.create("가온", 9, "github-controller-terminate-invalid", Course.BACKEND));
        Group group = createGroup(leader, "컨트롤러 잘못된 종료 상태 그룹");
        String accessToken = accessTokenProvider.issue(leader.getId()).value();
        String csrfToken = csrfToken(group.getId());

        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("{\"status\":\"ACTIVE\"}")
                .when()
                .patch("/groups/{groupId}", group.getId())
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("error.code", equalTo("INVALID_PARAMETER"));
    }

    @DisplayName("모임장은 동아리 반복 일정을 등록하거나 교체한 결과를 받는다.")
    @Test
    void replacesRecurringSchedule() {
        Member leader = memberRepository.save(Member.create("가온", 10, "github-controller-schedule", Course.BACKEND));
        Group group = createGroup(leader, "컨트롤러 반복 일정 그룹");
        String accessToken = accessTokenProvider.issue(leader.getId()).value();
        String csrfToken = csrfToken(group.getId());

        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("""
                        {
                          "daysOfWeek": ["TUESDAY", "THURSDAY"],
                          "startTime": "19:30:00",
                          "endTime": "21:30:00"
                        }
                        """)
                .when()
                .put("/groups/{groupId}/recurring-schedule", group.getId())
                .then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.daysOfWeek", hasItems("TUESDAY", "THURSDAY"))
                .body("data.startTime", equalTo("19:30:00"))
                .body("data.endTime", equalTo("21:30:00"))
                .body("error", nullValue());
    }

    @DisplayName("모임장은 요일만 고정하고 시간을 비운 반복 일정을 등록할 수 있다.")
    @Test
    void replacesRecurringScheduleWithFlexibleTime() {
        // Given
        Member leader = memberRepository.save(Member.create("가온", 12, "github-controller-schedule-flexible", Course.BACKEND));
        Group group = createGroup(leader, "컨트롤러 유동적 시간 그룹");
        String accessToken = accessTokenProvider.issue(leader.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When & Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("""
                        {
                          "daysOfWeek": ["TUESDAY", "THURSDAY"],
                          "startTime": null,
                          "endTime": null
                        }
                        """)
                .when()
                .put("/groups/{groupId}/recurring-schedule", group.getId())
                .then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.daysOfWeek", hasItems("TUESDAY", "THURSDAY"))
                .body("data.startTime", nullValue())
                .body("data.endTime", nullValue());

        // Then 조회에서도 요일은 남고 시간만 비어 있다.
        given()
                .when()
                .get("/groups/{groupId}", group.getId())
                .then()
                .statusCode(200)
                .body("data.recurringSchedule.daysOfWeek", hasItems("TUESDAY", "THURSDAY"))
                .body("data.recurringSchedule.startTime", nullValue())
                .body("data.recurringSchedule.endTime", nullValue());
    }

    @DisplayName("시작 시각만 있고 종료 시각이 없는 반복 일정은 등록할 수 없다.")
    @Test
    void rejectsRecurringScheduleWithOnlyStartTime() {
        // Given
        Member leader = memberRepository.save(Member.create("가온", 13, "github-controller-schedule-half-time", Course.BACKEND));
        Group group = createGroup(leader, "컨트롤러 반쪽 시간 그룹");
        String accessToken = accessTokenProvider.issue(leader.getId()).value();
        String csrfToken = csrfToken(group.getId());

        // When & Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("""
                        {
                          "daysOfWeek": ["TUESDAY"],
                          "startTime": "19:30:00",
                          "endTime": null
                        }
                        """)
                .when()
                .put("/groups/{groupId}/recurring-schedule", group.getId())
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("error.code", equalTo("SCHEDULE_INVALID_RULE"));
    }

    @DisplayName("모임장의 반복 일정 삭제 요청은 204를 반환하고 일정을 제거한다.")
    @Test
    void removesRecurringSchedule() {
        Member leader = memberRepository.save(Member.create("가온", 11, "github-controller-schedule-remove", Course.BACKEND));
        Group group = createGroup(leader, "컨트롤러 반복 일정 삭제 그룹");
        String accessToken = accessTokenProvider.issue(leader.getId()).value();
        String csrfToken = csrfToken(group.getId());

        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .when()
                .delete("/groups/{groupId}/recurring-schedule", group.getId())
                .then()
                .statusCode(204)
                .body(equalTo(""));

        given()
                .when()
                .get("/groups/{groupId}", group.getId())
                .then()
                .statusCode(200)
                .body("data.recurringSchedule", nullValue());
    }

    @DisplayName("세션 그룹 모임장은 세션 일정 교체 결과를 받는다.")
    @Test
    void replacesSessionSchedule() {
        Member leader = memberRepository.save(Member.create("가온", 12, "github-controller-session-schedule", Course.BACKEND));
        Group group = groupRepository.save(Group.createSession(
                "컨트롤러 세션 일정 그룹", "소개", null, "images/default-group.png",
                SessionGroupSchedule.of(LocalDate.of(2026, 8, 25), LocalTime.of(10, 0), LocalTime.of(11, 0)),
                TestSupportConfig.FIXED_NOW));
        groupMemberRepository.save(GroupMember.createLeader(group, leader, TestSupportConfig.FIXED_NOW));
        String accessToken = accessTokenProvider.issue(leader.getId()).value();
        String csrfToken = csrfToken(group.getId());

        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("""
                        {
                          "sessionDate": "2026-09-01",
                          "startTime": "13:00:00",
                          "endTime": "15:00:00"
                        }
                        """)
                .when()
                .put("/groups/{groupId}/session-schedule", group.getId())
                .then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.sessionDate", equalTo("2026-09-01"))
                .body("data.startTime", equalTo("13:00:00"))
                .body("data.endTime", equalTo("15:00:00"))
                .body("error", nullValue());
    }
}
