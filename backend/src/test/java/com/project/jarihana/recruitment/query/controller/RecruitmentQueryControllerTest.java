package com.project.jarihana.recruitment.query.controller;

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
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Set;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

class RecruitmentQueryControllerTest extends IntegrationTestSupport {

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private GroupRecruitmentJpaRepository recruitmentRepository;

    @Autowired
    private RegistrationJpaRepository registrationRepository;

    @Autowired
    private MemberRepository memberRepository;

    @DisplayName("모집 공고 상세 정보와 계산된 모집 상태를 조회한다.")
    @Test
    void findsRecruitmentDetail() {
        // Given
        LocalDateTime now = TestSupportConfig.FIXED_NOW;
        Group group = groupRepository.save(study("알고리즘 스터디"));
        GroupRecruitment recruitment = recruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.AUTO,
                3,
                now.minusHours(1),
                now.plusDays(1)
        ));
        Member firstMember = memberRepository.save(Member.create("가온", 8, "github-1", Course.BACKEND));
        Member secondMember = memberRepository.save(Member.create("마루", 8, "github-2", Course.FRONTEND));
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

        // When / Then
        given()
                .when()
                .get("/groups/{groupId}/recruitments/{recruitmentId}", group.getId(), recruitment.getId())
                .then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.id", equalTo(recruitment.getId().intValue()))
                .body("data.group.id", equalTo(group.getId().intValue()))
                .body("data.group.name", equalTo("알고리즘 스터디"))
                .body("data.group.status", equalTo("ACTIVE"))
                .body("data.joinMethod", equalTo("AUTO"))
                .body("data.capacity", equalTo(3))
                .body("data.approvedCount", equalTo(2))
                .body("data.remainingSeats", equalTo(1))
                .body("data.recruitingStatus", equalTo("OPEN"))
                .body("data.startsAt", equalTo("2026-08-19T09:00:00"))
                .body("data.endsAt", equalTo("2026-08-20T10:00:00"))
                .body("data.createdAt", equalTo("2026-08-19T10:00:00"))
                .body("error", nullValue());
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

    @DisplayName("존재하지 않는 그룹은 그룹 없음 오류를 반환한다.")
    @Test
    void rejectsUnknownGroup() {
        // Given / When / Then
        given()
                .when()
                .get("/groups/{groupId}/recruitments/{recruitmentId}", 999L, 1L)
                .then()
                .statusCode(404)
                .body("success", equalTo(false))
                .body("error.code", equalTo("GROUP_NOT_FOUND"));
    }

    @DisplayName("다른 그룹의 모집 공고는 모집 공고 없음 오류를 반환한다.")
    @Test
    void rejectsRecruitmentFromAnotherGroup() {
        // Given
        LocalDateTime now = TestSupportConfig.FIXED_NOW;
        Group firstGroup = groupRepository.save(study("첫 번째 스터디"));
        Group secondGroup = groupRepository.save(study("두 번째 스터디"));
        GroupRecruitment recruitment = recruitmentRepository.save(GroupRecruitment.create(
                firstGroup,
                JoinMethod.APPROVAL,
                3,
                now,
                null
        ));

        // When / Then
        given()
                .when()
                .get("/groups/{groupId}/recruitments/{recruitmentId}", secondGroup.getId(), recruitment.getId())
                .then()
                .statusCode(404)
                .body("success", equalTo(false))
                .body("error.code", equalTo("RECRUITMENT_NOT_FOUND"));
    }
}
