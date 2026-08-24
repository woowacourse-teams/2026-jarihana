package com.project.jarihana.registration.query.controller;

import com.project.jarihana.common.auth.AccessTokenProvider;
import com.project.jarihana.common.auth.AuthCookieProperties;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
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
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Set;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;

class MyRegistrationQueryControllerTest extends IntegrationTestSupport {

    private static final LocalDateTime NOW = TestSupportConfig.FIXED_NOW;

    @Autowired
    private GroupJpaRepository groupRepository;

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

    @DisplayName("회원이 여러 모집 공고의 자신의 신청을 상태와 커서로 조회한다.")
    @Test
    void findsMyRegistrationsAcrossRecruitmentsWithStatusAndCursorPagination() {
        // Given
        Member applicant = saveMember("신청자", Course.BACKEND, "my-registration-applicant");
        Member decisionMaker = saveMember("모임장", Course.FRONTEND, "my-registration-decision-maker");
        Member otherApplicant = saveMember("타회원", Course.ANDROID, "my-registration-other");
        Group firstGroup = saveGroup("my-registration-group-1");
        Group secondGroup = saveGroup("my-registration-group-2");
        GroupRecruitment firstRecruitment = saveRecruitment(firstGroup);
        GroupRecruitment secondRecruitment = saveRecruitment(secondGroup);

        Registration pending = savePending(firstRecruitment, applicant, "대기 메시지", NOW);
        Registration approved = savePending(
                secondRecruitment,
                applicant,
                "승인 메시지",
                NOW.minusHours(1)
        );
        registrationRepository.save(approved.approve(
                DecisionActor.member(decisionMaker.getId()),
                NOW.minusMinutes(30),
                0
        ));
        Registration rejected = savePending(
                firstRecruitment,
                applicant,
                "거절 메시지",
                NOW.minusHours(2)
        );
        registrationRepository.save(rejected.reject(
                DecisionActor.member(decisionMaker.getId()),
                "모집 인원이 마감되었습니다.",
                NOW.minusMinutes(20)
        ));
        savePending(firstRecruitment, otherApplicant, "다른 회원의 신청", NOW.plusMinutes(1));
        String accessToken = accessTokenProvider.issue(applicant.getId()).value();

        // When
        var firstPage = given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .queryParam("applicant", "me")
                .queryParam("size", 2)
                .when()
                .get("/registrations");

        // Then
        firstPage.then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.items.size()", equalTo(2))
                .body("data.items[0].id", equalTo(pending.getId().intValue()))
                .body("data.items[0].group.id", equalTo(firstGroup.getId().intValue()))
                .body("data.items[0].group.name", equalTo("my-registration-group-1"))
                .body("data.items[0].recruitmentId", equalTo(firstRecruitment.getId().intValue()))
                .body("data.items[0].message", equalTo("대기 메시지"))
                .body("data.items[0].status", equalTo("PENDING"))
                .body("data.items[1].id", equalTo(approved.getId().intValue()))
                .body("data.items[1].status", equalTo("APPROVED"))
                .body("data.items[1].decidedBy.type", equalTo("MEMBER"))
                .body("data.items[1].decidedBy.memberId", equalTo(decisionMaker.getId().intValue()))
                .body("data.nextCursor", not(nullValue()))
                .body("data.hasNext", equalTo(true))
                .body("error", nullValue());

        String nextCursor = firstPage.path("data.nextCursor");
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .queryParam("applicant", "me")
                .queryParam("cursor", nextCursor)
                .queryParam("size", 2)
                .when()
                .get("/registrations")
                .then()
                .statusCode(200)
                .body("data.items.size()", equalTo(1))
                .body("data.items[0].id", equalTo(rejected.getId().intValue()))
                .body("data.items[0].status", equalTo("REJECTED"))
                .body("data.items[0].decisionReason", equalTo("모집 인원이 마감되었습니다."))
                .body("data.nextCursor", nullValue())
                .body("data.hasNext", equalTo(false));

        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .queryParam("applicant", "me")
                .queryParam("status", "PENDING")
                .when()
                .get("/registrations")
                .then()
                .statusCode(200)
                .body("data.items.size()", equalTo(1))
                .body("data.items[0].id", equalTo(pending.getId().intValue()));
    }

    private Registration savePending(
            GroupRecruitment recruitment,
            Member applicant,
            String message,
            LocalDateTime registeredAt
    ) {
        return registrationRepository.save(Registration.createPending(
                recruitment,
                applicant,
                message,
                registeredAt
        ));
    }

    private GroupRecruitment saveRecruitment(Group group) {
        return recruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.APPROVAL,
                3,
                NOW.minusDays(1),
                NOW.plusDays(1)
        ));
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
                RecurringGroupSchedule.of(
                        Set.of(DayOfWeek.MONDAY),
                        LocalTime.of(19, 0),
                        LocalTime.of(21, 0)
                ),
                NOW
        ));
    }

    @DisplayName("신청자 식별자가 없거나 me가 아니면 거부한다.")
    @Test
    void rejectsInvalidApplicantParameter() {
        // Given
        Member applicant = saveMember("회원", Course.BACKEND, "my-registration-invalid-applicant");
        String accessToken = accessTokenProvider.issue(applicant.getId()).value();

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .when()
                .get("/registrations")
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("error.code", equalTo("INVALID_PARAMETER"));

        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .queryParam("applicant", "other")
                .when()
                .get("/registrations")
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("error.code", equalTo("INVALID_PARAMETER"));
    }

    @DisplayName("인증 없이 자신의 신청 목록을 조회할 수 없다.")
    @Test
    void rejectsUnauthenticatedRequest() {
        // Given / When / Then
        given()
                .queryParam("applicant", "me")
                .when()
                .get("/registrations")
                .then()
                .statusCode(401)
                .body("success", equalTo(false))
                .body("error.code", equalTo("UNAUTHENTICATED"));
    }
}
