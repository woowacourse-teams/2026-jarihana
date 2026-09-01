package com.project.jarihana.registration.query.controller;

import com.project.jarihana.common.auth.AccessTokenProvider;
import com.project.jarihana.common.auth.AuthCookieProperties;
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
import com.project.jarihana.registration.command.repository.RegistrationCommandRepository;
import com.project.jarihana.registration.domain.DecisionActor;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import io.restassured.response.Response;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Set;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

class RegistrationQueryControllerTest extends IntegrationTestSupport {

    private static final LocalDateTime NOW = TestSupportConfig.FIXED_NOW;

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private GroupMemberJpaRepository groupMemberRepository;

    @Autowired
    private GroupRecruitmentJpaRepository recruitmentRepository;

    @Autowired
    private RegistrationCommandRepository registrationRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @DisplayName("모임장이 모집 공고 신청자 목록을 상태와 커서로 조회한다.")
    @Test
    void findsRegistrationsForLeaderWithStatusAndCursorPagination() {
        // Given
        Member leader = saveMember("가온", Course.BACKEND, "registration-query-leader");
        Group group = saveGroup("신청자 조회 스터디");
        groupMemberRepository.save(GroupMember.createLeader(group, leader, NOW));
        GroupRecruitment recruitment = recruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.APPROVAL,
                3,
                NOW.minusDays(1),
                NOW.plusDays(1)
        ));
        Member pendingApplicant = saveMember("마루", Course.FRONTEND, "registration-query-pending");
        Member approvedApplicant = saveMember("누리", Course.ANDROID, "registration-query-approved");
        Member rejectedApplicant = saveMember("해음", Course.BACKEND, "registration-query-rejected");
        Registration pending = savePendingRegistration(
                recruitment,
                pendingApplicant,
                "함께 활동하고 싶습니다.",
                NOW
        );
        Registration approved = registrationRepository.save(Registration.createPending(
                recruitment,
                approvedApplicant,
                null,
                NOW.minusHours(1)
        ));
        registrationRepository.save(approved.approve(
                DecisionActor.member(leader.getId()),
                NOW.minusMinutes(30),
                0
        ));
        Registration rejected = registrationRepository.save(Registration.createPending(
                recruitment,
                rejectedApplicant,
                "관심 있습니다.",
                NOW.minusHours(2)
        ));
        registrationRepository.save(rejected.reject(
                DecisionActor.member(leader.getId()),
                "모집 인원이 마감되었습니다.",
                NOW.minusMinutes(45)
        ));
        String accessToken = accessTokenProvider.issue(leader.getId()).value();

        // When
        Response firstPage = given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .queryParam("size", 2)
                .when()
                .get("/recruitments/{recruitmentId}/registrations", recruitment.getId());

        // Then
        firstPage.then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.items.size()", equalTo(2))
                .body("data.items[0].id", equalTo(pending.getId().intValue()))
                .body("data.items[0].member.id", equalTo(pendingApplicant.getId().intValue()))
                .body("data.items[0].member.crewName", equalTo("마루"))
                .body("data.items[0].member.generation", equalTo(8))
                .body("data.items[0].member.course", equalTo("FRONTEND"))
                .body("data.items[0].message", equalTo("함께 활동하고 싶습니다."))
                .body("data.items[0].status", equalTo("PENDING"))
                .body("data.items[0].registeredAt", equalTo("2026-08-19T10:00:00"))
                .body("data.items[0].decisionReason", nullValue())
                .body("data.items[0].decidedAt", nullValue())
                .body("data.items[0].decidedBy", nullValue())
                .body("data.items[1].member.id", equalTo(approvedApplicant.getId().intValue()))
                .body("data.items[1].status", equalTo("APPROVED"))
                .body("data.items[1].decidedBy.type", equalTo("MEMBER"))
                .body("data.items[1].decidedBy.memberId", equalTo(leader.getId().intValue()))
                .body("data.nextCursor", not(nullValue()))
                .body("data.hasNext", equalTo(true))
                .body("error", nullValue());

        String nextCursor = firstPage.path("data.nextCursor");
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .queryParam("cursor", nextCursor)
                .queryParam("size", 2)
                .when()
                .get("/recruitments/{recruitmentId}/registrations", recruitment.getId())
                .then()
                .statusCode(200)
                .body("data.items.size()", equalTo(1))
                .body("data.items[0].member.id", equalTo(rejectedApplicant.getId().intValue()))
                .body("data.items[0].status", equalTo("REJECTED"))
                .body("data.items[0].decisionReason", equalTo("모집 인원이 마감되었습니다."))
                .body("data.items[0].decidedBy.type", equalTo("MEMBER"))
                .body("data.nextCursor", nullValue())
                .body("data.hasNext", equalTo(false));

        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .queryParam("status", "PENDING")
                .when()
                .get("/recruitments/{recruitmentId}/registrations", recruitment.getId())
                .then()
                .statusCode(200)
                .body("data.items.size()", equalTo(1))
                .body("data.items[0].status", equalTo("PENDING"));
    }

    private Registration savePendingRegistration(
            GroupRecruitment recruitment,
            Member applicant,
            String message,
            LocalDateTime registeredAt
    ) {
        return registrationRepository.save(Registration.createPending(recruitment, applicant, message, registeredAt));
    }

    private Member saveMember(String crewName, Course course, String githubId) {
        return memberRepository.save(Member.create(crewName, 8, githubId, course));
    }

    private Group saveGroup(String name) {
        return groupRepository.save(Group.createStudy(
                name,
                "함께 학습합니다.",
                null,
                null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.MONDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)),
                NOW
        ));
    }

    @DisplayName("모임장이 아닌 회원의 신청자 목록 조회를 거부한다.")
    @Test
    void rejectsRegistrationListRequestFromNonLeader() {
        // Given
        Member leader = saveMember("가온", Course.BACKEND, "registration-query-access-leader");
        Member member = saveMember("마루", Course.FRONTEND, "registration-query-access-member");
        Group group = saveGroup("신청자 권한 스터디");
        groupMemberRepository.save(GroupMember.createLeader(group, leader, NOW));
        groupMemberRepository.save(GroupMember.createMember(group, member, NOW));
        GroupRecruitment recruitment = recruitmentRepository.save(GroupRecruitment.create(
                group, JoinMethod.APPROVAL, 3, NOW.minusDays(1), NOW.plusDays(1)));

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessTokenProvider.issue(member.getId()).value())
                .when()
                .get("/recruitments/{recruitmentId}/registrations", recruitment.getId())
                .then()
                .statusCode(403)
                .body("success", equalTo(false))
                .body("error.code", equalTo("RECRUITMENT_ACCESS_DENIED"));
    }

    @DisplayName("인증 없이 신청자 목록을 조회할 수 없다.")
    @Test
    void rejectsUnauthenticatedRegistrationListRequest() {
        // Given / When / Then
        given()
                .when()
                .get("/recruitments/{recruitmentId}/registrations", 1L)
                .then()
                .statusCode(401)
                .body("success", equalTo(false))
                .body("error.code", equalTo("UNAUTHENTICATED"));
    }

    @DisplayName("존재하지 않는 모집 공고의 신청자 목록은 404를 반환한다.")
    @Test
    void rejectsUnknownRecruitment() {
        // Given
        Member member = saveMember("가온", Course.BACKEND, "registration-query-unknown");

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessTokenProvider.issue(member.getId()).value())
                .when()
                .get("/recruitments/{recruitmentId}/registrations", 999L)
                .then()
                .statusCode(404)
                .body("success", equalTo(false))
                .body("error.code", equalTo("RECRUITMENT_NOT_FOUND"));
    }

    @DisplayName("정의되지 않은 상태 필터와 잘못된 페이지 크기는 400을 반환한다.")
    @Test
    void rejectsInvalidQueryParameters() {
        // Given
        Member leader = saveMember("가온", Course.BACKEND, "registration-query-invalid");
        Group group = saveGroup("신청자 파라미터 스터디");
        groupMemberRepository.save(GroupMember.createLeader(group, leader, NOW));
        GroupRecruitment recruitment = recruitmentRepository.save(GroupRecruitment.create(
                group, JoinMethod.APPROVAL, 3, NOW.minusDays(1), NOW.plusDays(1)));
        String accessToken = accessTokenProvider.issue(leader.getId()).value();

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .queryParam("status", "INVALID")
                .when()
                .get("/recruitments/{recruitmentId}/registrations", recruitment.getId())
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("error.code", equalTo("INVALID_PARAMETER"));

        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .queryParam("size", 101)
                .when()
                .get("/recruitments/{recruitmentId}/registrations", recruitment.getId())
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("error.code", equalTo("INVALID_PARAMETER"));

        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .queryParam("cursor", "invalid-cursor")
                .when()
                .get("/recruitments/{recruitmentId}/registrations", recruitment.getId())
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("error.code", equalTo("INVALID_PARAMETER"));
    }

    @DisplayName("모임장이 그룹의 대기 신청 요약을 조회한다.")
    @Test
    void findsRegistrationSummaryForLeader() {
        // Given
        Member leader = saveMember("요약가온", Course.BACKEND, "registration-summary-query-leader");
        Group group = saveGroup("신청 요약 조회 스터디");
        Group otherGroup = saveGroup("다른 신청 요약 조회 스터디");
        groupMemberRepository.save(GroupMember.createLeader(group, leader, NOW));
        GroupRecruitment openRecruitment = recruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.APPROVAL,
                3,
                NOW.minusDays(1),
                NOW.plusDays(1)
        ));
        GroupRecruitment closedRecruitment = recruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.APPROVAL,
                3,
                NOW.minusDays(5),
                NOW.plusDays(1)
        ));
        GroupRecruitment otherRecruitment = recruitmentRepository.save(GroupRecruitment.create(
                otherGroup,
                JoinMethod.APPROVAL,
                3,
                NOW.minusDays(1),
                NOW.plusDays(1)
        ));
        savePendingRegistration(
                openRecruitment,
                saveMember("요약나래", Course.FRONTEND, "registration-summary-query-open"),
                null,
                NOW.minusHours(1)
        );
        Registration latest = savePendingRegistration(
                closedRecruitment,
                saveMember("요약다온", Course.ANDROID, "registration-summary-query-closed"),
                null,
                NOW
        );
        Registration approved = savePendingRegistration(
                closedRecruitment,
                saveMember("요약라온", Course.BACKEND, "registration-summary-query-approved"),
                null,
                NOW.plusMinutes(1)
        );
        registrationRepository.save(approved.approve(DecisionActor.member(leader.getId()), NOW.plusMinutes(2), 0));
        recruitmentRepository.save(closedRecruitment.closeAt(NOW.plusMinutes(3)));
        savePendingRegistration(
                otherRecruitment,
                saveMember("요약마루", Course.FRONTEND, "registration-summary-query-other"),
                null,
                NOW.plusHours(3)
        );
        String accessToken = accessTokenProvider.issue(leader.getId()).value();

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .when()
                .get("/groups/{groupId}/registrations/summary", group.getId())
                .then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.pendingCount", equalTo(2))
                .body("data.targetRecruitmentId", equalTo(latest.getRecruitment().getId().intValue()))
                .body("error", nullValue());
    }

    @DisplayName("대기 신청이 없으면 0과 null 대상 모집 공고를 반환한다.")
    @Test
    void findsEmptyRegistrationSummaryForLeader() {
        // Given
        Member leader = saveMember("요약바다", Course.BACKEND, "registration-summary-query-empty-leader");
        Group group = saveGroup("빈 신청 요약 조회 스터디");
        groupMemberRepository.save(GroupMember.createLeader(group, leader, NOW));
        recruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.APPROVAL,
                3,
                NOW.minusDays(1),
                NOW.plusDays(1)
        ));

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessTokenProvider.issue(leader.getId()).value())
                .when()
                .get("/groups/{groupId}/registrations/summary", group.getId())
                .then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.pendingCount", equalTo(0))
                .body("data.targetRecruitmentId", nullValue())
                .body("error", nullValue());
    }

    @DisplayName("인증 없이 대기 신청 요약을 조회할 수 없다.")
    @Test
    void rejectsUnauthenticatedRegistrationSummaryRequest() {
        // Given / When / Then
        given()
                .when()
                .get("/groups/{groupId}/registrations/summary", 1L)
                .then()
                .statusCode(401)
                .body("success", equalTo(false))
                .body("error.code", equalTo("UNAUTHENTICATED"));
    }

    @DisplayName("모임장이 아닌 회원의 대기 신청 요약 조회를 거부한다.")
    @Test
    void rejectsRegistrationSummaryRequestFromNonLeader() {
        // Given
        Member leader = saveMember("요약사랑", Course.BACKEND, "registration-summary-query-access-leader");
        Member member = saveMember("요약아름", Course.FRONTEND, "registration-summary-query-access-member");
        Group group = saveGroup("신청 요약 권한 스터디");
        groupMemberRepository.save(GroupMember.createLeader(group, leader, NOW));
        groupMemberRepository.save(GroupMember.createMember(group, member, NOW));

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessTokenProvider.issue(member.getId()).value())
                .when()
                .get("/groups/{groupId}/registrations/summary", group.getId())
                .then()
                .statusCode(403)
                .body("success", equalTo(false))
                .body("error.code", equalTo("GROUP_ACCESS_DENIED"));
    }

    @DisplayName("존재하지 않는 그룹의 대기 신청 요약은 404를 반환한다.")
    @Test
    void rejectsRegistrationSummaryForUnknownGroup() {
        // Given
        Member member = saveMember("요약이든", Course.BACKEND, "registration-summary-query-unknown");

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessTokenProvider.issue(member.getId()).value())
                .when()
                .get("/groups/{groupId}/registrations/summary", 999L)
                .then()
                .statusCode(404)
                .body("success", equalTo(false))
                .body("error.code", equalTo("GROUP_NOT_FOUND"));
    }
}
