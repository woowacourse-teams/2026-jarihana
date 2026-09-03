package com.project.jarihana.group.command.controller;

import com.project.jarihana.common.auth.AccessTokenProvider;
import com.project.jarihana.common.auth.AuthCookieProperties;
import com.project.jarihana.group.domain.Group;
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
import org.springframework.beans.factory.annotation.Autowired;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.assertj.core.api.Assertions.assertThat;

class GroupCommandControllerTest extends IntegrationTestSupport {

    @Autowired
    private GroupJpaRepository groupRepository;

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
        Group group = groupRepository.findById(groupId).orElseThrow();
        assertThat(group.getMeetingType()).isEqualTo(MeetingType.OFFLINE);
        assertThat(group.getLocation()).isEqualTo("서울 캠퍼스");
        assertThat(group.getRepresentativeImageKey()).isEqualTo("groups/tmp/controller.webp");
    }

    @DisplayName("업로드되지 않은 대표 이미지 키로 그룹을 개설할 수 없다.")
    @Test
    void rejectsCreateWithUnknownRepresentativeImageKey() {
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
