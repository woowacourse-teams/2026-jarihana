package com.project.jarihana.recruitment.query.controller;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.oneOf;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.RegistrationJpaRepository;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.recruitment.query.repository.GroupRecruitmentJpaRepository;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import io.restassured.response.Response;
import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class RecruitmentListControllerTest extends IntegrationTestSupport {

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private GroupRecruitmentJpaRepository recruitmentRepository;

    @Autowired
    private RegistrationJpaRepository registrationRepository;

    @Autowired
    private MemberRepository memberRepository;

    @DisplayName("그룹의 모집 공고 이력을 최신순으로 커서 페이지네이션한다.")
    @Test
    void findsRecruitmentHistoryWithCursorPagination() {
        // Given
        LocalDateTime now = TestSupportConfig.FIXED_NOW;
        Group group = groupRepository.save(study("모집 이력 스터디"));
        GroupRecruitment closed = recruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.APPROVAL,
                8,
                now.minusDays(10),
                now.minusDays(5)
        ));
        GroupRecruitment scheduled = recruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.APPROVAL,
                3,
                now.plusHours(1),
                now.plusDays(2)
        ));
        GroupRecruitment alwaysOpen = recruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.AUTO,
                4,
                now.minusDays(1),
                null
        ));
        saveApprovedRegistrations(alwaysOpen, now);

        // When
        Response firstPage = given()
                .queryParam("size", 2)
                .when()
                .get("/groups/{groupId}/recruitments", group.getId());

        // Then
        firstPage.then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.items.size()", equalTo(2))
                .body("data.items[0].id", equalTo(alwaysOpen.getId().intValue()))
                .body("data.items[0].joinMethod", equalTo("AUTO"))
                .body("data.items[0].capacity", equalTo(4))
                .body("data.items[0].approvedCount", equalTo(2))
                .body("data.items[0].recruitingStatus", equalTo("ALWAYS_OPEN"))
                .body("data.items[0].createdAt", equalTo("2026-08-19T10:00:00"))
                .body("data.items[1].id", equalTo(scheduled.getId().intValue()))
                .body("data.items[1].approvedCount", equalTo(0))
                .body("data.items[1].recruitingStatus", equalTo("SCHEDULED"))
                .body("data.nextCursor", not(oneOf(nullValue(), equalTo(""))))
                .body("data.hasNext", equalTo(true))
                .body("error", nullValue());

        String nextCursor = firstPage.path("data.nextCursor");

        given()
                .queryParam("cursor", nextCursor)
                .queryParam("size", 2)
                .when()
                .get("/groups/{groupId}/recruitments", group.getId())
                .then()
                .statusCode(200)
                .body("data.items.size()", equalTo(1))
                .body("data.items[0].id", equalTo(closed.getId().intValue()))
                .body("data.items[0].recruitingStatus", equalTo("CLOSED"))
                .body("data.nextCursor", nullValue())
                .body("data.hasNext", equalTo(false));
    }

    @DisplayName("존재하지 않는 그룹의 모집 이력은 그룹 없음 오류를 반환한다.")
    @Test
    void rejectsUnknownGroup() {
        // Given / When / Then
        given()
                .when()
                .get("/groups/{groupId}/recruitments", 999L)
                .then()
                .statusCode(404)
                .body("success", equalTo(false))
                .body("error.code", equalTo("GROUP_NOT_FOUND"));
    }

    @DisplayName("모집 이력의 페이지 크기가 범위를 벗어나면 잘못된 파라미터 오류를 반환한다.")
    @Test
    void rejectsInvalidSize() {
        // Given
        Group group = groupRepository.save(study("페이지 크기 스터디"));

        // When / Then
        given()
                .queryParam("size", 101)
                .when()
                .get("/groups/{groupId}/recruitments", group.getId())
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("error.code", equalTo("INVALID_PARAMETER"));
    }

    @DisplayName("잘못된 모집 이력 커서는 잘못된 파라미터 오류를 반환한다.")
    @Test
    void rejectsInvalidCursor() {
        // Given
        Group group = groupRepository.save(study("잘못된 커서 스터디"));

        // When / Then
        given()
                .queryParam("cursor", "invalid-cursor")
                .when()
                .get("/groups/{groupId}/recruitments", group.getId())
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("error.code", equalTo("INVALID_PARAMETER"))
                .body("error.message", equalTo("요청 파라미터가 올바르지 않습니다."));
    }

    private void saveApprovedRegistrations(GroupRecruitment recruitment, LocalDateTime now) {
        Member firstMember = memberRepository.save(Member.create(
                "가온",
                8,
                "recruitment-list-1",
                Course.BACKEND
        ));
        Member secondMember = memberRepository.save(Member.create(
                "마루",
                8,
                "recruitment-list-2",
                Course.FRONTEND
        ));
        registrationRepository.save(Registration.createAutoApproved(
                recruitment,
                firstMember,
                null,
                now,
                0
        ));
        registrationRepository.save(Registration.createAutoApproved(
                recruitment,
                secondMember,
                null,
                now,
                1
        ));
    }

    private static Group study(String name) {
        return Group.createStudy(
                name,
                "함께 학습합니다.",
                null,
                null,
                RecurringGroupSchedule.of(
                        Set.of(DayOfWeek.MONDAY),
                        LocalTime.NOON,
                        LocalTime.of(13, 0)
                ),
                TestSupportConfig.FIXED_NOW
        );
    }
}
